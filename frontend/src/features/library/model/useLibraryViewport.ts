import { useVirtualGrid } from "shared/lib/useVirtualGrid";
import type { LibraryQuery } from "./libraryQuery";
import { useLibraryPages, useLibraryWindow } from "./useLibraryPages";

/** All catalog presentations observe the same bounded pages and viewport geometry. */
export function useLibraryViewport(
  query: LibraryQuery | null,
  options: Omit<
    Parameters<typeof useVirtualGrid>[0],
    "count" | "minimumCount" | "resetKey"
  > & { loading?: boolean },
) {
  const collection = useLibraryWindow(query);
  const { loading = !query, ...geometry } = options;
  const grid = useVirtualGrid({
    ...geometry,
    count: query ? collection.totalSize : loading ? null : 0,
    minimumCount:
      collection.knownSize + (collection.totalSize === null ? 1 : 0),
    resetKey: collection.queryKey,
  });
  const range = useLibraryPages(collection, grid.range);
  return { grid, range, hasData: collection.first.data !== undefined };
}
