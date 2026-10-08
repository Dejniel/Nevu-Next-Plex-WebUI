import { hashKey, useQueries, useQuery } from "@tanstack/react-query";
import { useServerSession } from "features/session/model";
import { useUserSettings } from "features/settings/model";
import { serverQueryClient } from "shared/api/queryClient";
import type { GridRange } from "shared/lib/useVirtualGrid";
import {
  type ListPage,
  listPageOptions,
  listRangeOffsets,
  listWindowOptions,
  mediaListResultKey,
  validateListWindow,
} from "./listPages";
import type { MediaListQuery, MediaListRecord } from "./mediaLists";

const initialRange: GridRange = { start: 0, end: 0, visibleStart: 0, visibleEnd: 0 };

export function useMediaListWindow(query: MediaListQuery) {
  const profileKey = useUserSettings((state) => state.profileKey) ?? "";
  const serverId = useServerSession((state) => state.server?.machineIdentifier) ?? "";
  const scope = { profileKey, serverId };
  const enabled = Boolean(profileKey && serverId);
  const prefix = mediaListResultKey(scope, query);
  const window = useQuery(
    { ...listWindowOptions(serverQueryClient, scope, query), enabled },
    serverQueryClient,
  );
  const first = useQuery(
    {
      ...listPageOptions(scope, query, window.data.revision, 0),
      enabled: enabled && !window.isFetching && !window.error,
    },
    serverQueryClient,
  );
  const cached =
    enabled && first.data?.total === null
      ? serverQueryClient.getQueriesData<ListPage>({
          queryKey: [...prefix, "page", window.data.revision],
        }).flatMap(([, page]) => page ? [page] : [])
      : [];
  return {
    query,
    scope,
    enabled,
    window,
    first,
    key: hashKey(prefix),
    total: first.data?.total ?? cached.find((page) => page.total !== null)?.total ?? null,
    knownSize: Math.max(
      first.data?.items.length ?? 0,
      ...cached.map((page) => page.offset + page.items.length),
    ),
  };
}

export function useMediaList(list: ReturnType<typeof useMediaListWindow>, range = initialRange) {
  const { query, scope, enabled, window, first } = list;
  const visible = new Set(listRangeOffsets(range.visibleStart, range.visibleEnd, list.total));
  const offsets = listRangeOffsets(range.start, range.end, list.total)
    .filter((offset) => offset !== 0)
    .sort((a, b) => Number(visible.has(b)) - Number(visible.has(a)));
  const results = useQueries(
    {
      queries: enabled
        ? offsets.map((offset) => ({
            ...listPageOptions(scope, query, window.data.revision, offset, visible.has(offset) ? 0 : 1),
            enabled: !window.isFetching && !window.error,
          }))
        : [],
    },
    serverQueryClient,
  );
  const pages = enabled
    ? [first, ...results].flatMap((result) => result.data ? [result.data] : [])
    : [];
  let error: Error | null = window.error;
  let consistent = true;
  if (pages.some((page) => page.offset === 0)) {
    try {
      validateListWindow(pages, query.kind);
    } catch (failure) {
      error = failure as Error;
      consistent = false;
    }
  }
  const items = new Map<number, MediaListRecord>();
  if (consistent)
    pages.forEach((page) =>
      page.items.forEach((item, index) => items.set(page.offset + index, item)),
    );
  return {
    key: list.key,
    items,
    summary: enabled ? (first.data?.summary ?? null) : null,
    total: list.total,
    knownSize: Math.max(list.knownSize, ...pages.map((page) => page.offset + page.items.length)),
    error: (error ?? first.error ?? results.find((result) => result.error)?.error)?.message ?? null,
    loading: Boolean(enabled && !first.data && !error && first.isPending),
    retry: () =>
      error
        ? window.refetch()
        : Promise.all(
            [first, ...results].filter((result) => result.error).map((result) => result.refetch()),
          ),
  };
}
