import {
  queryOptions,
  type QueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import type { MediaScope } from "entities/media/model";
import {
  pageOffsets,
  queryWindowKey,
  queryWindowOptions,
} from "shared/lib/queryWindow";
import { runPageRequest } from "shared/lib/requestLimiter";
import { createMediaListSource } from "../api/mediaLists";
import type {
  MediaListPage,
  MediaListQuery,
  MediaListSummary,
} from "./mediaLists";

export const LIST_PAGE_SIZE = 100;
export interface ListPage extends MediaListPage {
  summary: MediaListSummary | null;
}
export function mediaListResultKey(scope: MediaScope, query: MediaListQuery) {
  return [
    "media-lists",
    scope.serverId,
    scope.profileKey,
    {
      kind: query.kind,
      libraryID: query.kind === "collection" ? (query.libraryID ?? null) : null,
      id: query.id ?? null,
      playlistType:
        query.kind === "playlist" && !query.id
          ? (query.playlistType ?? "video")
          : null,
      search: query.id ? "" : (query.search ?? ""),
      sort: query.id ? "" : (query.sort ?? "titleSort:asc"),
    },
  ] as const;
}
export const mediaListWindowKey = (scope: MediaScope, query: MediaListQuery) =>
  queryWindowKey(mediaListResultKey(scope, query));
export function listPageOptions(
  scope: MediaScope,
  query: MediaListQuery,
  revision: number,
  offset: number,
  priority = 0,
) {
  return queryOptions({
    queryKey: [
      ...mediaListResultKey(scope, query),
      "page",
      revision,
      offset,
      LIST_PAGE_SIZE,
    ] as const,
    queryFn: ({ signal }): Promise<ListPage> =>
      runPageRequest(signal, priority, async () => {
        const source = createMediaListSource(query, signal);
        const [page, summary] = await Promise.all([
          source.page(offset, LIST_PAGE_SIZE),
          offset === 0 ? source.summary() : null,
        ]);
        if (page.offset !== offset)
          throw new Error("Plex returned a mismatched list page.");
        return { ...page, summary };
      }),
    staleTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}
export function validateListWindow(
  pages: readonly ListPage[],
  kind: MediaListQuery["kind"],
) {
  const total = pages.find((page) => page.total !== null)?.total;
  const ids = new Set<string>();
  for (const page of pages) {
    if (page.total !== null && total !== undefined && page.total !== total)
      throw new Error("The list changed while loading. Please try again.");
    page.items.forEach((record, index) => {
      if (record.kind === "media" && record.position !== page.offset + index)
        throw new Error("Plex returned inconsistent playlist positions.");
      const id =
        record.kind !== "media"
          ? record.id
          : kind === "playlist"
            ? record.playlistItemID
            : record.item.ratingKey;
      if (id !== undefined && ids.has(id))
        throw new Error("The list changed while loading. Please try again.");
      if (id !== undefined) ids.add(id);
    });
  }
}
export function listWindowOptions(
  client: QueryClient,
  scope: MediaScope,
  query: MediaListQuery,
) {
  return queryWindowOptions(
    client,
    mediaListResultKey(scope, query),
    (revision, offset) => listPageOptions(scope, query, revision, offset),
    (first) => first.total,
    (pages) => validateListWindow(pages, query.kind),
  );
}
export const listRangeOffsets = (
  start: number,
  end: number,
  total: number | null,
) => pageOffsets(start, end, total, LIST_PAGE_SIZE);

export function mediaListResultFromKey(key: QueryKey) {
  const [kind, serverId, profileKey, parameters] = key as ReturnType<
    typeof mediaListResultKey
  >;
  if (
    kind !== "media-lists" ||
    !parameters ||
    typeof serverId !== "string" ||
    typeof profileKey !== "string"
  )
    return null;
  const query: MediaListQuery = {
    ...parameters,
    id: parameters.id ?? undefined,
    libraryID: parameters.libraryID ?? undefined,
    sort: parameters.sort || undefined,
    playlistType: parameters.playlistType ?? undefined,
  };
  const scope = { serverId, profileKey };
  return { scope, query, prefix: mediaListResultKey(scope, query) };
}
