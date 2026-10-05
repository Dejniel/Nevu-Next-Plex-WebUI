import { hashKey, useQueries, useQuery } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { useServerSession } from "features/session/model";
import { useUserSettings } from "features/settings/model";
import { serverQueryClient } from "shared/api/queryClient";
import type { GridRange } from "shared/ui/VirtualGrid";
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
export function useMediaList(query: MediaListQuery) {
  const profileKey = useUserSettings((state) => state.profileKey) ?? "";
  const serverId = useServerSession((state) => state.server?.machineIdentifier) ?? "";
  const scope = { profileKey, serverId };
  const enabled = Boolean(profileKey && serverId);
  const key = hashKey(mediaListResultKey(scope, query));
  const [selection, setSelection] = useState({ key, range: initialRange });
  const range = selection.key === key ? selection.range : initialRange;
  const requestRange = useCallback((next: GridRange) => setSelection({ key, range: next }), [key]);
  const window = useQuery(
    { ...listWindowOptions(serverQueryClient, scope, query), enabled },
    serverQueryClient,
  );
  const revision = window.data.revision;
  const first = serverQueryClient.getQueryData(listPageOptions(scope, query, revision, 0).queryKey);
  const total =
    first?.total ??
    serverQueryClient
      .getQueriesData<ListPage>({
        queryKey: [...mediaListResultKey(scope, query), "page", revision],
      })
      .find(([, page]) => page?.total != null)?.[1]?.total ??
    null;
  const visible = new Set(listRangeOffsets(range.visibleStart, range.visibleEnd, total));
  const offsets = [...new Set([0, ...listRangeOffsets(range.start, range.end, total)])].sort(
    (a, b) => Number(visible.has(b)) - Number(visible.has(a)),
  );
  const results = useQueries(
    {
      queries: enabled
        ? offsets.map((offset) => ({
            ...listPageOptions(scope, query, revision, offset, visible.has(offset) ? 0 : 1),
            enabled: !window.isFetching && !window.error,
          }))
        : [],
    },
    serverQueryClient,
  );
  const pages = results.flatMap((result) => (result.data ? [result.data] : []));
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
  const knownSize = Math.max(0, ...pages.map((page) => page.offset + page.items.length));
  return {
    key,
    items,
    summary: enabled ? (first?.summary ?? null) : null,
    total,
    knownSize,
    error: (error ?? results.find((result) => result.error)?.error)?.message ?? null,
    loading: Boolean(enabled && !first && !error && results[0]?.isPending),
    requestRange,
    retry: () =>
      error
        ? window.refetch()
        : Promise.all(results.filter((result) => result.error).map((result) => result.refetch())),
  };
}
