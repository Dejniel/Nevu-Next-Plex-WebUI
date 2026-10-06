import type { QueryClient } from "@tanstack/react-query";
import {
  changedMediaFields,
  type LibraryItemUpdateDto,
  type LibraryPageDto,
} from "@nevu/contracts";
import { affectedMediaParents, type MediaChange, type MediaScope, type ReconciledMediaChange } from "entities/media/model";
import {
  decideLibrarySynchronization,
  libraryDependenciesUnaffected,
} from "./librarySynchronization";
import { libraryResultFromKey } from "./libraryQuery";
import { isQueryWindowKey, queryPageLocation, type QueryWindow } from "shared/lib/queryWindow";

export function getCachedLibraryItems(client: QueryClient, scope: MediaScope) {
  return [
    ...client.getQueriesData<LibraryPageDto>({
      queryKey: ["library", scope.serverId, scope.profileKey],
      predicate: (query) => queryPageLocation(query.queryKey) !== null,
    }).flatMap(([, page]) => page?.items ?? []),
    ...client.getQueriesData<Plex.MediaContainer>({
      queryKey: ["library-directory", scope.serverId, scope.profileKey],
    }).flatMap(([, container]) => container?.Metadata ?? []),
  ];
}

export async function applyLibraryChanges(
  client: QueryClient,
  changes: readonly ReconciledMediaChange[],
) {
  if (!changes.length) return;
  const scope = changes[0].change;
  const windows = client
    .getQueryCache()
    .findAll({ queryKey: ["library", scope.serverId, scope.profileKey] })
    .filter((query) => isQueryWindowKey(query.queryKey));
  const refreshes: Promise<void>[] = [];
  for (const window of windows) {
    const result = libraryResultFromKey(window.queryKey);
    if (!result) continue;
    const { query, prefix } = result;
    const pages = client.getQueryCache().findAll({ queryKey: [...prefix, "page"] });
    const published = (window.state.data as QueryWindow).revision;
    const beforeItems = pages
      .filter((page) => queryPageLocation(page.queryKey)?.revision === published)
      .flatMap((page) => (page.state.data as LibraryPageDto | undefined)?.items ?? []);
    const patches = new Map<string, NonNullable<LibraryItemUpdateDto["item"]>>();
    let refresh = false;
    for (const entry of changes) {
      const { change, update } = entry;
      refresh ||= affectedMediaParents(entry).some((id) =>
        beforeItems.some((item) => item.ratingKey === id),
      );
      const before =
        update?.item && beforeItems.find((item) => item.ratingKey === update.item!.ratingKey);
      const fields = before && update?.item ? changedMediaFields(before, update.item) : [];
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
              parentIds: affectedMediaParents(entry),
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
        client.invalidateQueries(
          { queryKey: window.queryKey, exact: true, refetchType: "active" },
          { throwOnError: true },
        ),
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
