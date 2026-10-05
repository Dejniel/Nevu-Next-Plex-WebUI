import type {
  LibraryFilterExpression,
  LibraryItemType,
  LibrarySort,
  LibrarySource,
} from "@nevu/contracts";
import {
  libraryFilterExpressionKey,
  normalizeLibraryFilterExpression,
} from "./libraryFilterExpression";

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

/** Result prefix and page identity for the Query migration; revision is local. */
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
