import type {
  LibraryCardDto,
  LibraryFilterExpression,
  LibraryItemType,
  LibraryPageDto,
  LibraryPageRequest,
  LibrarySource,
  LibrarySort,
} from "@nevu/contracts";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { createQueryClient, serverQueryClient } from "shared/api/queryClient";
import { subscribeToLibraryCache } from "shared/lib/libraryCache";
import { useAutoRefresh } from "shared/lib/useAutoRefresh";
import {
  emptyCollection,
  findPagedCollection,
  getPagedCollection,
  type CollectionSnapshot,
} from "shared/lib/PagedCollection";
import { RequestQueue } from "shared/lib/RequestQueue";
import { getLibraryPage, LibraryPageError } from "../api/libraryPage";
import { libraryFilterExpressionKey } from "./libraryFilterExpression";
import { isRandomLibrarySort } from "./librarySort";

export const LIBRARY_RANGE_SIZE = 64;
export interface LibraryQuery {
  profileKey: string;
  sectionId: number;
  source?: LibrarySource;
  type?: LibraryItemType;
  sort: LibrarySort;
  filterExpression?: LibraryFilterExpression;
  seed?: string;
}
export type LibraryRangeSnapshot = CollectionSnapshot<LibraryCardDto>;
type PageFetcher = (
  request: LibraryPageRequest,
  signal?: AbortSignal,
) => Promise<LibraryPageDto>;
const EMPTY_SNAPSHOT = emptyCollection<LibraryCardDto>();

export function libraryQueryKey(query: LibraryQuery) {
  return JSON.stringify([
    query.profileKey,
    query.sectionId,
    query.source || "all",
    query.type || "any",
    query.sort,
    libraryFilterExpressionKey(query.filterExpression),
    query.seed || "",
  ]);
}
const cacheKey = (key: string) => {
  const [profile, section] = JSON.parse(key);
  return ["library", profile, String(section), key] as const;
};

export function useLibraryQueryRange(query: LibraryQuery | null | undefined) {
  const queryKey = useMemo(
    () => (query ? libraryQueryKey(query) : null),
    [query],
  );
  const range = useLibraryRange(queryKey);
  const refresh = useAutoRefresh(queryKey, () =>
    queryKey ? libraryRangeStore.revalidateQuery(queryKey) : undefined,
  );

  useEffect(() => {
    if (!query) return;
    const key = libraryRangeStore.ensure(query);
    return () => libraryRangeStore.release(key);
    // The serialized key is the query identity. Depending on the object reference
    // releases live demand when URL normalization recreates an equivalent query.
    // oxlint-disable-next-line react/exhaustive-deps
  }, [queryKey]);

  useEffect(
    () =>
      subscribeToLibraryCache((scope) => {
        if (!query) return;
        if (scope?.profileKey && scope.profileKey !== query.profileKey) return;
        if (scope?.sectionId && scope.sectionId !== String(query.sectionId))
          return;
        refresh.current?.invalidate();
      }),
    [query, refresh],
  );

  return { queryKey, range };
}

/** The library adapter owns Plex query identity and catalog refresh rules. */
export class LibraryRangeStore {
  private readonly queue: RequestQueue;
  constructor(
    private readonly fetchPage: PageFetcher = getLibraryPage,
    concurrency = 2,
    private readonly client: QueryClient = createQueryClient(),
  ) {
    this.queue = new RequestQueue(concurrency);
  }
  subscribe = (listener: () => void) =>
    this.client.getQueryCache().subscribe((event) => {
      if (event.query.queryKey[0] === "library") listener();
    });
  getSnapshot = (key: string | null) =>
    key
      ? (this.client.getQueryData<LibraryRangeSnapshot>(cacheKey(key)) ??
        EMPTY_SNAPSHOT)
      : EMPTY_SNAPSHOT;
  private resource(key: string) {
    return findPagedCollection<LibraryCardDto>(cacheKey(key), this.client);
  }
  ensure(query: LibraryQuery) {
    const key = libraryQueryKey(query);
    getPagedCollection(
      cacheKey(key),
      {
        pageSize: LIBRARY_RANGE_SIZE,
        queue: this.queue,
        refreshCatalog: isRandomLibrarySort(query.sort),
        finishInactivePages: true,
        identity: (item: LibraryCardDto) => item.ratingKey,
        describeError: (error: unknown) => ({
          message:
            error instanceof Error
              ? error.message
              : "Could not load this library.",
          retryable: error instanceof LibraryPageError ? error.retryable : true,
          ...(error instanceof LibraryPageError && error.status
            ? { status: error.status }
            : {}),
        }),
        page: async (offset, signal, refresh) => {
          const { profileKey: _profile, ...request } = query;
          const page = await this.fetchPage(
            {
              ...request,
              offset,
              size: LIBRARY_RANGE_SIZE,
              ...(refresh ? { refresh: true } : {}),
            },
            signal,
          );
          if (page.offset !== offset)
            throw new LibraryPageError(
              "Plex returned a mismatched library range",
              false,
            );
          return { ...page, total: page.totalSize };
        },
      },
      this.client,
    ).retain();
    return key;
  }
  demand(
    key: string,
    start: number,
    end: number,
    visibleStart = start,
    visibleEnd = end,
  ) {
    this.resource(key)?.demand(start, end, visibleStart, visibleEnd);
  }
  retry(key: string, offset: number) {
    this.resource(key)?.retry(
      Math.floor(Math.max(0, offset) / LIBRARY_RANGE_SIZE) * LIBRARY_RANGE_SIZE,
    );
  }
  invalidateQuery(key: string) {
    void this.revalidateQuery(key);
  }
  revalidateQuery(key: string) {
    return this.resource(key)?.refresh() ?? Promise.resolve();
  }
  release(key: string) {
    this.resource(key)?.release();
  }
  drop(key: string) {
    this.client.removeQueries({ queryKey: cacheKey(key) });
  }
  clear() {
    this.client.removeQueries({ queryKey: ["library"] });
  }
}

export const libraryRangeStore = new LibraryRangeStore(
  getLibraryPage,
  2,
  serverQueryClient,
);
export function useLibraryRange(queryKey: string | null) {
  return useSyncExternalStore(
    libraryRangeStore.subscribe,
    () => libraryRangeStore.getSnapshot(queryKey),
    () => libraryRangeStore.getSnapshot(queryKey),
  );
}
