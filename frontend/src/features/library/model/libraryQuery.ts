import type { MediaMetadata } from "entities/media/model";
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
  parentId?: string;
  folderId?: string;
  source?: LibrarySource;
  type?: LibraryItemType;
  sort: LibrarySort;
  filterExpression?: LibraryFilterExpression;
  seed?: string;
}

/** Album tracks use Plex's disc-aware indexed order, rather than metadata fields. */
export function musicChildrenQuery(
  profileKey: string,
  sectionId: number,
  item: Pick<MediaMetadata, "ratingKey" | "type"> | undefined,
): LibraryQuery | null {
  if (!item || (item.type !== "artist" && item.type !== "album")) return null;
  return {
    profileKey,
    sectionId,
    source: "children",
    parentId: item.ratingKey,
    type: item.type === "artist" ? "album" : "track",
    sort: item.type === "album" ? "track.absoluteIndex" : "year:desc,titleSort",
  };
}

/** Plex's root photo catalog includes albums; a photo-only search hides them. */
export function libraryRootQueryType(type: LibraryItemType, allPhotos = false): LibraryItemType | undefined {
  return type === "photo" && !allPhotos ? undefined : type;
}

/** Canonical result prefix and page identity; revision is local. */
export function libraryResultQueryKey(serverId: string, query: LibraryQuery) {
  return [
    "library",
    serverId,
    query.profileKey,
    {
      sectionId: query.sectionId,
      ...(query.parentId && { parentId: query.parentId }),
      ...(query.folderId && { folderId: query.folderId }),
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
