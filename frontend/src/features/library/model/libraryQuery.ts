import type { QueryKey } from "@tanstack/react-query";
import type {
  LibraryFilterExpression,
  LibraryItemType,
  LibrarySort,
  LibrarySource,
} from "@nevu/contracts";
import { normalizeLibraryFilterExpression } from "./libraryFilterExpression";

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

/** Canonical result prefix and page identity; revision is local. */
export function libraryResultQueryKey(serverId: string, query: LibraryQuery) {
  return [
    "library",
    serverId,
    query.profileKey,
    {
      sectionId: query.sectionId,
      source: query.source || "all",
      type: query.type || "any",
      sort: query.sort,
      filterExpression: normalizeLibraryFilterExpression(query.filterExpression) ?? null,
      seed: query.seed || "",
    },
  ] as const;
}

export function libraryPageQueryKey(
  serverId: string,
  query: LibraryQuery,
  revision: number,
  offset: number,
  size = LIBRARY_RANGE_SIZE,
) {
  return [...libraryResultQueryKey(serverId, query), "page", revision, offset, size] as const;
}

export function libraryResultFromKey(key: QueryKey) {
  const [kind, serverId, profileKey, parameters] = key as ReturnType<typeof libraryResultQueryKey>;
  if (
    kind !== "library" ||
    !parameters ||
    typeof serverId !== "string" ||
    typeof profileKey !== "string"
  )
    return null;
  const query: LibraryQuery = {
    ...parameters,
    profileKey,
    type: parameters.type === "any" ? undefined : parameters.type,
    filterExpression: parameters.filterExpression ?? undefined,
  };
  return { serverId, query, prefix: libraryResultQueryKey(serverId, query) };
}
