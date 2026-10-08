import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { libraryEntryKey, type LibraryPageDto } from "@nevu/contracts";
import { runPageRequest } from "shared/lib/requestLimiter";
import { pageOffsets, queryWindowKey, queryWindowOptions } from "shared/lib/queryWindow";
import { getLibraryPage, LibraryPageError } from "../api/libraryPage";
import {
  LIBRARY_RANGE_SIZE,
  libraryPageQueryKey,
  libraryResultQueryKey,
  type LibraryQuery,
} from "./libraryQuery";

export const libraryWindowKey = (serverId: string, query: LibraryQuery) =>
  queryWindowKey(libraryResultQueryKey(serverId, query));

export function libraryPageOptions(
  serverId: string,
  query: LibraryQuery,
  revision: number,
  offset: number,
  priority = 0,
) {
  return queryOptions({
    queryKey: libraryPageQueryKey(serverId, query, revision, offset),
    queryFn: ({ signal }) =>
      runPageRequest(signal, priority, async () => {
        const page = await getLibraryPage({ ...query, offset, size: LIBRARY_RANGE_SIZE }, signal);
        if (page.offset !== offset)
          throw new LibraryPageError("Plex returned a mismatched page.", true);
        return page;
      }),
    staleTime: Infinity,
    structuralSharing: true,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
  });
}

export function validateLibraryWindow(pages: readonly LibraryPageDto[]) {
  const first = pages.find((page) => page.offset === 0)!;
  const ids = new Set<string>();
  for (const page of pages) {
    if (
      page.generationId !== first.generationId ||
      (page.totalSize !== null && first.totalSize !== null && page.totalSize !== first.totalSize)
    )
      throw new LibraryPageError("The library changed while loading. Please try again.", true);
    for (const item of page.items) {
      if (ids.has(libraryEntryKey(item)))
        throw new LibraryPageError("The library changed while loading. Please try again.", true);
      ids.add(libraryEntryKey(item));
    }
  }
}

export function libraryWindowOptions(client: QueryClient, serverId: string, query: LibraryQuery) {
  return queryWindowOptions(
    client,
    libraryResultQueryKey(serverId, query),
    (revision, offset) => libraryPageOptions(serverId, query, revision, offset),
    (first) => first.totalSize ?? (!first.hasMore ? first.size : null),
    validateLibraryWindow,
  );
}

export function libraryRangeOffsets(start: number, end: number, total: number | null) {
  return pageOffsets(start, end, total, LIBRARY_RANGE_SIZE);
}
