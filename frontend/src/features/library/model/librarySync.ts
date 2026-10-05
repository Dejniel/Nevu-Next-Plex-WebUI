import type { QueryClient } from "@tanstack/react-query";
import { focusManager } from "@tanstack/react-query";
import {
  changedLibraryFields,
  type LibraryItemUpdateDto,
  type LibraryPageDto,
} from "@nevu/contracts";
import { mediaMetadataQueryKey, type MediaChange, type MediaScope } from "entities/media/model";
import { serverQueryClient } from "shared/api/queryClient";
import { invalidateRandomCatalogs, synchronizeLibraryItem } from "../api/libraryPage";
import {
  decideLibrarySynchronization,
  libraryDependenciesUnaffected,
} from "./librarySynchronization";
import type { LibraryQuery } from "./libraryQuery";
import type { libraryResultQueryKey } from "./libraryQuery";

export async function applyLibraryChanges(
  client: QueryClient,
  changes: readonly { change: MediaChange; update?: LibraryItemUpdateDto }[],
) {
  if (!changes.length) return;
  const scope = changes[0].change;
  const windows = client
    .getQueryCache()
    .findAll({ queryKey: ["library", scope.serverId, scope.profileKey] })
    .filter((query) => query.queryKey[4] === "window");
  const refreshes: Promise<void>[] = [];
  for (const window of windows) {
    const parameters = window.queryKey[3] as ReturnType<typeof libraryResultQueryKey>[3];
    const query: LibraryQuery = {
      ...parameters,
      profileKey: scope.profileKey,
      type: parameters.type === "any" ? undefined : parameters.type,
      filterExpression: parameters.filterExpression ?? undefined,
    };
    const prefix = window.queryKey.slice(0, 4);
    const pages = client.getQueryCache().findAll({ queryKey: [...prefix, "page"] });
    const published = (window.state.data as { revision: number }).revision;
    const beforeItems = pages
      .filter((page) => page.queryKey[5] === published)
      .flatMap((page) => (page.state.data as LibraryPageDto | undefined)?.items ?? []);
    const patches = new Map<string, NonNullable<LibraryItemUpdateDto["item"]>>();
    let refresh = false;
    for (const { change, update } of changes) {
      const before =
        update?.item && beforeItems.find((item) => item.ratingKey === update.item!.ratingKey);
      const fields = before && update?.item ? changedLibraryFields(before, update.item) : [];
      // Equal cards do not prove that omitted metadata used by an opaque predicate is unchanged.
      const comparable = fields.length > 0 || libraryDependenciesUnaffected(query, fields);
      const effect: MediaChange =
        update?.item && before && comparable
          ? {
              ...change,
              kind: "item",
              effect: "metadata",
              id: update.item.ratingKey,
              sectionId: update.sectionId,
              fields,
              parentIds: update.parentIds,
            }
          : change;
      const decision = decideLibrarySynchronization(scope.serverId, query, effect);
      refresh ||= decision === "refresh";
      if (decision === "patch" && update?.item) patches.set(update.item.ratingKey, update.item);
    }
    if (!refresh && !patches.size) continue;
    // Reads started before a confirmed change must not publish over it.
    refresh ||=
      window.state.fetchStatus === "fetching" ||
      pages.some((page) => page.state.fetchStatus === "fetching");
    await client.cancelQueries({ queryKey: prefix });
    if (refresh) {
      // Each affected result refreshes once per batch; inactive offsets belong to the old revision.
      refreshes.push(
        client.invalidateQueries({ queryKey: window.queryKey, exact: true, refetchType: "active" }),
      );
    } else {
      client.setQueriesData<LibraryPageDto>({ queryKey: [...prefix, "page"] }, (page) =>
        !page
          ? page
          : {
              ...page,
              items: page.items.map((item) => patches.get(item.ratingKey) ?? item),
            },
      );
    }
  }
  await Promise.all(refreshes);
}

/** Event batching only. Query owns data, errors, requests and result lifetimes.
 * At most one batch per five seconds during a scan, with a trailing reconciliation. */
export function startLibrarySynchronization(
  scope: MediaScope,
  isCurrent: () => boolean,
  client = serverQueryClient,
) {
  const abort = new AbortController();
  const pending = new Map<string, MediaChange>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;
  let lastStarted = -Infinity;
  const schedule = () => {
    if (timer || running || !pending.size || !focusManager.isFocused()) return;
    timer = setTimeout(
      () => {
        timer = undefined;
        void flush();
      },
      Math.max(750, 5000 - (Date.now() - lastStarted)),
    );
  };
  const flush = async () => {
    if (!isCurrent() || abort.signal.aborted || !focusManager.isFocused()) return;
    running = true;
    lastStarted = Date.now();
    const batch = [...pending.values()];
    pending.clear();
    try {
      const changes: { change: MediaChange; update?: LibraryItemUpdateDto }[] = [];
      const invalidatedSections = new Set<string>();
      for (const change of batch) {
        if (!isCurrent() || abort.signal.aborted) break;
        let update: LibraryItemUpdateDto | undefined;
        if (change.kind === "item" && change.effect !== "membership" && change.id) {
          try {
            const metadataKey = mediaMetadataQueryKey(scope, change.id);
            const cached = client.getQueryState(metadataKey) !== undefined;
            update = await synchronizeLibraryItem(change.id, abort.signal, cached);
            if (isCurrent() && !abort.signal.aborted && cached) {
              await client.cancelQueries({ queryKey: metadataKey, exact: true });
              if (update.metadata) client.setQueryData(metadataKey, update.metadata);
              else await client.invalidateQueries({ queryKey: metadataKey, exact: true });
            }
          } catch (error) {
            if (abort.signal.aborted) throw error;
          }
        }
        const section = change.sectionId ?? "all";
        if (!update && !invalidatedSections.has("all") && !invalidatedSections.has(section)) {
          await invalidateRandomCatalogs(change.sectionId, abort.signal);
          invalidatedSections.add(section);
        }
        if (!isCurrent() || abort.signal.aborted) break;
        changes.push({
          change: update ? { ...change, sectionId: update.sectionId } : change,
          update,
        });
      }
      const parentIds = new Set(changes.flatMap(({ update }) => update?.parentIds ?? []));
      if (isCurrent() && !abort.signal.aborted) {
        await client.invalidateQueries({
          queryKey: ["media", scope.serverId, scope.profileKey],
          predicate: (query) =>
            parentIds.has(String(query.queryKey[3])) ||
            changes.some(({ change, update }) => {
              if (update?.metadata) return false;
              if (change.kind === "list") return false;
              if (change.kind === "item" && change.id) return query.queryKey[3] === change.id;
              const metadata = query.state.data as Plex.Metadata | undefined;
              return (
                !change.sectionId ||
                !metadata ||
                String(metadata.librarySectionID) === change.sectionId
              );
            }),
        });
      }
      if (isCurrent() && !abort.signal.aborted) await applyLibraryChanges(client, changes);
    } catch {
      if (isCurrent() && !abort.signal.aborted) {
        // A failed canonical read/recovery is not proof of freshness. Preserve the pending scope.
        pending.set("recovery", { ...scope, kind: "recovery" });
      }
    } finally {
      running = false;
      schedule();
    }
  };
  const unfocus = focusManager.subscribe((focused) => {
    if (focused) schedule();
  });
  return {
    enqueue(change: MediaChange) {
      if (
        !isCurrent() ||
        change.serverId !== scope.serverId ||
        change.profileKey !== scope.profileKey
      )
        return;
      if (change.kind === "list" && change.listKind === "playlist") return;
      const key =
        change.kind === "item" && change.id
          ? `item:${change.id}`
          : `${change.kind}:${change.sectionId ?? "all"}`;
      const previous = pending.get(key);
      // A later processing hint cannot weaken an observed insertion/deletion.
      if (!previous || previous.kind !== "item" || previous.effect !== "membership")
        pending.set(key, change);
      if (pending.size > 256) {
        pending.clear();
        pending.set("recovery", { ...scope, kind: "recovery" });
      }
      schedule();
    },
    dispose() {
      abort.abort();
      if (timer) clearTimeout(timer);
      pending.clear();
      unfocus();
    },
  };
}
