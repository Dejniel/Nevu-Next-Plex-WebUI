import type { Query, QueryClient } from "@tanstack/react-query";
import { changedMediaFields } from "@nevu/contracts";
import { affectedMediaParents, matchesMediaScope, type MediaChange, type MediaScope, type ReconciledMediaChange } from "entities/media/model";
import { isQueryWindowKey, queryPageLocation, type QueryWindow } from "shared/lib/queryWindow";
import { mediaListResultFromKey, type ListPage } from "./listPages";
import { decideMediaListSynchronization } from "./listSynchronization";

export function getCachedListItems(client: QueryClient, scope: MediaScope) {
  return client
    .getQueryCache()
    .findAll({ queryKey: ["media-lists", scope.serverId, scope.profileKey] })
    .flatMap((query) => queryPageLocation(query.queryKey) === null ? [] :
      ((query.state.data as ListPage | undefined)?.items ?? []).flatMap((record) =>
        record.kind === "media" && record.supported ? [record.item] : [],
      ),
    );
}

export async function applyMediaListChanges(
  client: QueryClient,
  changes: readonly ReconciledMediaChange[],
) {
  if (!changes.length) return;
  const scope = changes[0].change;
  const removed = changes.flatMap(({ change }) =>
    matchesMediaScope(scope, change) && change.kind === "list" &&
      change.effect === "removed" && change.id ? [change] : [],
  );
  if (removed.length) {
    const deleted = {
      queryKey: ["media-lists", scope.serverId, scope.profileKey],
      predicate: (cached: Query) => {
        const result = mediaListResultFromKey(cached.queryKey);
        return Boolean(result && removed.some((change) =>
          change.listKind === result.query.kind && change.id === result.query.id,
        ));
      },
    };
    await client.cancelQueries(deleted);
    client.removeQueries(deleted);
  }
  const windows = client
    .getQueryCache()
    .findAll({ queryKey: ["media-lists", scope.serverId, scope.profileKey] })
    .filter((query) => isQueryWindowKey(query.queryKey));
  const refreshes: Promise<void>[] = [];
  for (const window of windows) {
    const result = mediaListResultFromKey(window.queryKey);
    if (!result) continue;
    const { query, prefix } = result;
    const pages = client.getQueryCache().findAll({ queryKey: [...prefix, "page"] });
    const revision = (window.state.data as QueryWindow).revision;
    const published = pages.filter(
      (page) => queryPageLocation(page.queryKey)?.revision === revision,
    );
    const records = published.flatMap(
      (page) => (page.state.data as ListPage | undefined)?.items ?? [],
    );
    const summary = (
      published.find((page) => queryPageLocation(page.queryKey)?.offset === 0)?.state.data as
        ListPage | undefined
    )?.summary;
    const patches = new Map<string, Plex.Metadata>();
    let refresh = false;
    for (const entry of changes) {
      const { change, update, parentScopeUnknown } = entry;
      const metadata = update?.metadata as Plex.Metadata | undefined;
      const before = records.find(
        (record) =>
          record.kind === "media" &&
          record.supported &&
          record.item.ratingKey === update?.item?.ratingKey,
      );
      // A regular playlist has explicit positions. Smart/collection predicates remain opaque.
      const manual = query.kind === "playlist" && query.id && summary?.smart === false;
      const fields =
        before?.kind === "media" && metadata
          ? changedMediaFields(before.item, metadata)
          : ["unknown"];
      const effect: MediaChange =
        metadata &&
        update?.item &&
        (fields.length || manual) &&
        change.kind === "item" &&
        change.effect !== "membership"
          ? {
              ...change,
              effect: "metadata",
              id: update.item.ratingKey,
              fields,
              parentIds: affectedMediaParents(entry),
            }
          : change;
      let decision = decideMediaListSynchronization(scope, query, effect, summary ?? undefined);
      if (
        affectedMediaParents(entry).some((id) =>
          records.some(
            (record) => record.kind === "media" && record.supported && record.item.ratingKey === id,
          ),
        ) || (parentScopeUnknown && records.some((record) =>
          record.kind === "media" && record.supported &&
          (record.item.type === "show" || record.item.type === "season") &&
          (!change.sectionId || String(record.item.librarySectionID) === change.sectionId),
        ))
      )
        decision = "refresh";
      refresh ||= decision === "refresh";
      if (decision === "patch" && metadata && update?.item)
        patches.set(update.item.ratingKey, metadata);
    }
    if (!refresh && !patches.size) continue;
    refresh ||=
      window.state.fetchStatus === "fetching" ||
      pages.some((page) => page.state.fetchStatus === "fetching");
    await client.cancelQueries({ queryKey: prefix });
    if (refresh)
      refreshes.push(
        client.invalidateQueries(
          { queryKey: window.queryKey, exact: true, refetchType: "active" },
          { throwOnError: true },
        ),
      );
    else
      client.setQueriesData<ListPage>({ queryKey: [...prefix, "page"] }, (page) =>
        !page
          ? page
          : {
              ...page,
              items: page.items.map((record) => {
                if (record.kind !== "media" || !record.supported) return record;
                const item = patches.get(record.item.ratingKey);
                return item
                  ? {
                      ...record,
                      item: {
                        ...item,
                        ...(record.playlistItemID !== undefined && {
                          playlistItemID: record.playlistItemID,
                        }),
                      },
                    }
                  : record;
              }),
            },
      );
  }
  await Promise.all(refreshes);
}
