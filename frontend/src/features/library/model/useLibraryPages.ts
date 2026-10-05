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
export function useLibraryPages(query: LibraryQuery | null | undefined, range = initialRange) {
  const serverId = useServerSession((state) => state.server?.machineIdentifier) ?? "";
  const enabled = Boolean(query && serverId);
  // A disabled hook has a separate identity and never starts transport work.
  const source = query ?? { profileKey: "", sectionId: 0, sort: "titleSort" };
  const window = useQuery(
    { ...libraryWindowOptions(serverQueryClient, serverId, source), enabled },
    serverQueryClient,
  );
  const revision = window.data.revision;
  const first = serverQueryClient.getQueryData(
    libraryPageOptions(serverId, source, revision, 0).queryKey,
  );
  const tail =
    first?.totalSize === null
      ? serverQueryClient
          .getQueriesData<LibraryPageDto>({
            queryKey: [...libraryResultQueryKey(serverId, source), "page", revision],
          })
          .find(([, page]) => page?.hasMore === false)?.[1]
      : undefined;
  const total = first?.totalSize ?? (tail ? tail.offset + tail.size : null);
  const visible = new Set(libraryRangeOffsets(range.visibleStart, range.visibleEnd, total));
  const offsets = [...new Set([0, ...libraryRangeOffsets(range.start, range.end, total)])].sort(
    (a, b) => Number(visible.has(b)) - Number(visible.has(a)),
  );
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
  const pages = results.flatMap((result) => (result.data ? [result.data] : []));
  const errors = new Map<number, LibraryPageError>();
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
  const knownSize = Math.max(0, ...pages.map((page) => page.offset + page.size));
  const refreshError = window.error as LibraryPageError | null;
  if (refreshError || consistencyError) errors.set(0, refreshError ?? consistencyError!);
  return {
    queryKey: enabled ? hashKey(libraryResultQueryKey(serverId, source)) : null,
    items,
    errors,
    knownSize,
    totalSize: total,
    hasMore: total === null,
    refresh: () => window.refetch(),
    retry: (offset: number) =>
      refreshError || consistencyError
        ? window.refetch()
        : results[offsets.indexOf(offset)]?.refetch(),
  };
}
