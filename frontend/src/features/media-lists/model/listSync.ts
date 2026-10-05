import type { QueryClient } from "@tanstack/react-query";
import { changedMediaFields } from "@nevu/contracts";
import type { MediaChange, MediaScope, ReconciledMediaChange } from "entities/media/model";
import type { QueryWindow } from "shared/lib/queryWindow";
import type { ListPage, mediaListResultKey } from "./listPages";
import type { MediaListQuery } from "./mediaLists";
import { decideMediaListSynchronization } from "./listSynchronization";

export function hasCachedListMedia(client: QueryClient, scope: MediaScope, id: string) {
  return client
    .getQueryCache()
    .findAll({ queryKey: ["media-lists", scope.serverId, scope.profileKey] })
    .some(
      (query) =>
        query.queryKey[4] === "page" &&
        (query.state.data as ListPage | undefined)?.items.some(
          (record) => record.kind === "media" && record.supported && record.item.ratingKey === id,
        ),
    );
}

export async function applyMediaListChanges(
  client: QueryClient,
  changes: readonly ReconciledMediaChange[],
) {
  if (!changes.length) return;
  const scope = changes[0].change;
  const windows = client
    .getQueryCache()
    .findAll({ queryKey: ["media-lists", scope.serverId, scope.profileKey] })
    .filter((query) => query.queryKey[4] === "window");
  const refreshes: Promise<void>[] = [];
  for (const window of windows) {
    const parameters = window.queryKey[3] as ReturnType<typeof mediaListResultKey>[3];
    const query: MediaListQuery = {
      ...parameters,
      id: parameters.id ?? undefined,
      libraryID: parameters.libraryID ?? undefined,
      sort: parameters.sort || undefined,
    };
    const prefix = window.queryKey.slice(0, 4);
    const pages = client.getQueryCache().findAll({ queryKey: [...prefix, "page"] });
    const revision = (window.state.data as QueryWindow).revision;
    const published = pages.filter((page) => page.queryKey[5] === revision);
    const records = published.flatMap(
      (page) => (page.state.data as ListPage | undefined)?.items ?? [],
    );
    const summary = (
      published.find((page) => page.queryKey[6] === 0)?.state.data as ListPage | undefined
    )?.summary;
    const patches = new Map<string, Plex.Metadata>();
    let refresh = false;
    for (const { change, update } of changes) {
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
              parentIds: update.parentIds,
            }
          : change;
      let decision = decideMediaListSynchronization(scope, query, effect, summary ?? undefined);
      if (
        update?.parentIds?.some((id) =>
          records.some(
            (record) => record.kind === "media" && record.supported && record.item.ratingKey === id,
          ),
        )
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
