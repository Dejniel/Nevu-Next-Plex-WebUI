import { hashKey, useQueries, useQuery } from "@tanstack/react-query";
import type { LibraryCardDto, LibraryPageDto } from "@nevu/contracts";
import { useServerSession } from "features/session/model";
import { serverQueryClient } from "shared/api/queryClient";
import type { GridRange } from "shared/ui/VirtualGrid";
import {
  libraryPageOptions,
  libraryRangeOffsets,
  libraryWindowOptions,
  validateLibraryWindow,
} from "./libraryPages";
import { libraryResultQueryKey, type LibraryQuery } from "./libraryQuery";
import { LibraryPageError } from "../api/libraryPage";

const initialRange: GridRange = { start: 0, end: 0, visibleStart: 0, visibleEnd: 0 };

/** First-page metadata sizes the grid; range observers follow its current render. */
export function useLibraryWindow(query: LibraryQuery | null | undefined) {
  const serverId = useServerSession((state) => state.server?.machineIdentifier) ?? "";
  const enabled = Boolean(query && serverId);
  const source = query ?? { profileKey: "", sectionId: 0, sort: "titleSort" };
  const prefix = libraryResultQueryKey(serverId, source);
  const window = useQuery(
    { ...libraryWindowOptions(serverQueryClient, serverId, source), enabled },
    serverQueryClient,
  );
  const first = useQuery(
    {
      ...libraryPageOptions(serverId, source, window.data.revision, 0),
      enabled: enabled && !window.isFetching && !window.error,
    },
    serverQueryClient,
  );
  const cached =
    enabled && first.data?.totalSize === null
      ? serverQueryClient.getQueriesData<LibraryPageDto>({
          queryKey: [...prefix, "page", window.data.revision],
        }).flatMap(([, page]) => page ? [page] : [])
      : [];
  const tail = cached.find((page) => !page.hasMore);
  return {
    serverId,
    source,
    enabled,
    window,
    first,
    queryKey: enabled ? hashKey(prefix) : null,
    totalSize: first.data?.totalSize ?? (tail ? tail.offset + tail.size : null),
    knownSize: Math.max(first.data?.size ?? 0, ...cached.map((page) => page.offset + page.size)),
  };
}

export function useLibraryPages(
  collection: ReturnType<typeof useLibraryWindow>,
  range = initialRange,
) {
  const { serverId, source, enabled, window, first } = collection;
  const revision = window.data.revision;
  const total = collection.totalSize;
  const visible = new Set(libraryRangeOffsets(range.visibleStart, range.visibleEnd, total));
  const offsets = libraryRangeOffsets(range.start, range.end, total)
    .filter((offset) => offset !== 0)
    .sort((a, b) => Number(visible.has(b)) - Number(visible.has(a)));
  const results = useQueries(
    {
      queries: enabled
        ? offsets.map((offset) => ({
            ...libraryPageOptions(serverId, source, revision, offset, visible.has(offset) ? 0 : 1),
            enabled: !window.isFetching && !window.error,
          }))
        : [],
    },
    serverQueryClient,
  );
  const pages = enabled
    ? [first, ...results].flatMap((result) => result.data ? [result.data] : [])
    : [];
  const errors = new Map<number, LibraryPageError>();
  if (enabled && first.error) errors.set(0, first.error as LibraryPageError);
  results.forEach((result, index) => {
    if (result.error) errors.set(offsets[index], result.error as LibraryPageError);
  });
  let consistencyError: LibraryPageError | undefined;
  if (pages.some((page) => page.offset === 0)) {
    try {
      validateLibraryWindow(pages);
    } catch (error) {
      consistencyError = error as LibraryPageError;
    }
  }
  const items = new Map<number, LibraryCardDto>();
  if (!consistencyError)
    pages.forEach((page) =>
      page.items.forEach((item, index) => items.set(page.offset + index, item)),
    );
  const refreshError = window.error as LibraryPageError | null;
  if (refreshError || consistencyError) errors.set(0, refreshError ?? consistencyError!);
  return {
    queryKey: collection.queryKey,
    items,
    errors,
    knownSize: Math.max(collection.knownSize, ...pages.map((page) => page.offset + page.size)),
    totalSize: total,
    hasMore: total === null,
    refresh: () => window.refetch(),
    retry: (offset: number) =>
      refreshError || consistencyError
        ? window.refetch()
        : offset === 0 ? first.refetch() : results[offsets.indexOf(offset)]?.refetch(),
  };
}
