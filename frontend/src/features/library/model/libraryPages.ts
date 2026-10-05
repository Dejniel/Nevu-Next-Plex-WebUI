import { queryOptions, type QueryClient } from "@tanstack/react-query";
import type { LibraryPageDto } from "@nevu/contracts";
import { createRequestLimiter } from "shared/lib/requestLimiter";
import { getLibraryPage, LibraryPageError } from "../api/libraryPage";
import {
  LIBRARY_RANGE_SIZE,
  libraryPageQueryKey,
  libraryResultQueryKey,
  type LibraryQuery,
} from "./libraryQuery";

const run = createRequestLimiter(2);
let nextRevision = 0;
export interface LibraryWindow {
  revision: number;
}
export const libraryWindowKey = (serverId: string, query: LibraryQuery) =>
  [...libraryResultQueryKey(serverId, query), "window"] as const;

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
      run(signal, priority, async () => {
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
      if (ids.has(item.ratingKey))
        throw new LibraryPageError("The library changed while loading. Please try again.", true);
      ids.add(item.ratingKey);
    }
  }
}

/** The descriptor is coordination only; every response lives in its page query.
 * Native observers supply the union of all consumers' current windows. */
export function libraryWindowOptions(client: QueryClient, serverId: string, query: LibraryQuery) {
  const key = libraryWindowKey(serverId, query);
  const prefix = libraryResultQueryKey(serverId, query);
  return queryOptions({
    queryKey: key,
    initialData: (): LibraryWindow => ({ revision: ++nextRevision }),
    staleTime: 30_000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: 60_000,
    queryFn: async ({ signal }): Promise<LibraryWindow> => {
      const published = client.getQueryData<LibraryWindow>(key)!;
      const revision = ++nextRevision;
      const cancel = () => {
        void client.cancelQueries({ queryKey: [...prefix, "page", revision] });
      };
      signal.addEventListener("abort", cancel, { once: true });
      try {
        const first = await client.fetchQuery(libraryPageOptions(serverId, query, revision, 0));
        const total = first.totalSize ?? (!first.hasMore ? first.size : null);
        const pages = new Map<number, LibraryPageDto>([[0, first]]);
        // Recheck after each batch: scrolling or another consumer can join during refresh.
        while (true) {
          signal.throwIfAborted();
          const offsets = client
            .getQueryCache()
            .findAll({ queryKey: [...prefix, "page", published.revision] })
            .filter((page) => page.getObserversCount() > 0)
            .map((page) => Number(page.queryKey[6]))
            .filter((offset) => !pages.has(offset) && (total === null || offset < total));
          if (!offsets.length) break;
          await Promise.all(
            offsets.map(async (offset) => {
              pages.set(
                offset,
                await client.fetchQuery(libraryPageOptions(serverId, query, revision, offset)),
              );
            }),
          );
        }
        validateLibraryWindow([...pages.values()]);
        signal.throwIfAborted();
        return { revision };
      } catch (error) {
        await client.cancelQueries({ queryKey: [...prefix, "page", revision] });
        throw error;
      } finally {
        signal.removeEventListener("abort", cancel);
      }
    },
  });
}

export function libraryRangeOffsets(start: number, end: number, total: number | null) {
  const offsets: number[] = [];
  const last = total === null ? end : Math.min(end, total - 1);
  for (
    let offset = Math.floor(Math.max(0, start) / LIBRARY_RANGE_SIZE) * LIBRARY_RANGE_SIZE;
    offset <= last;
    offset += LIBRARY_RANGE_SIZE
  )
    offsets.push(offset);
  return offsets;
}
