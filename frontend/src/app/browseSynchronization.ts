import { focusManager } from "@tanstack/react-query";
import {
  applyAvailabilityChanges,
  hasCachedAvailableMedia,
  mediaMetadataQueryKey,
  type MediaChange,
  type MediaScope,
  type ReconciledMediaChange,
} from "entities/media/model";
import {
  applyLibraryChanges,
  invalidateRandomCatalogs,
  synchronizeLibraryItem,
} from "features/library/model";
import { applyMediaListChanges, hasCachedListMedia } from "features/media-lists/model";
import { serverQueryClient } from "shared/api/queryClient";

/** Event batching only. Query owns data, errors, requests and result lifetimes.
 * At most one batch per five seconds during a scan, with a trailing reconciliation. */
export function startBrowseSynchronization(
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
      const changes: ReconciledMediaChange[] = [];
      const invalidatedSections = new Set<string>();
      for (const change of batch) {
        if (!isCurrent() || abort.signal.aborted) break;
        let update: ReconciledMediaChange["update"];
        if (change.kind === "item" && change.effect !== "membership" && change.id) {
          try {
            const metadataKey = mediaMetadataQueryKey(scope, change.id);
            const cached = client.getQueryState(metadataKey) !== undefined;
            const includeDetails =
              cached ||
              hasCachedListMedia(client, scope, change.id) ||
              hasCachedAvailableMedia(client, scope, change.id);
            update = await synchronizeLibraryItem(change.id, abort.signal, includeDetails);
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
        if (
          !update &&
          !(change.kind === "list" && change.listKind === "playlist") &&
          !invalidatedSections.has("all") &&
          !invalidatedSections.has(section)
        ) {
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
      if (isCurrent() && !abort.signal.aborted)
        await Promise.all([
          applyLibraryChanges(client, changes),
          applyMediaListChanges(client, changes),
          applyAvailabilityChanges(client, changes),
        ]);
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
      const key =
        change.kind === "item" && change.id
          ? `item:${change.id}`
          : change.kind === "list"
            ? `list:${change.listKind}:${change.sectionId ?? "all"}:${change.id ?? "all"}`
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
