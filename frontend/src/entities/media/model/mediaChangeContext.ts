import type { MediaMetadata } from "plex/media";
import type { QueryClient } from "@tanstack/react-query";
import type { MediaScope } from "./mediaChanges";

export function getCachedMediaItems(client: QueryClient, scope: MediaScope) {
  return ["media", "media-children", "availability"].flatMap((kind) =>
    client.getQueriesData<MediaMetadata | MediaMetadata[]>({
      queryKey: [kind, scope.serverId, scope.profileKey],
    }).flatMap(([, data]) => data ? (Array.isArray(data) ? data : [data]) : []),
  );
}

/** Read relationships from response projections, without retaining another media index. */
interface MediaOccurrence {
  ratingKey: string;
  type?: string;
  librarySectionID?: number;
  parentRatingKey?: string;
  grandparentRatingKey?: string;
  Children?: MediaMetadata["Children"];
  OnDeck?: MediaMetadata["OnDeck"];
}

export function mediaChangeContext(
  items: readonly MediaOccurrence[],
  id: string,
) {
  const occurrences: MediaOccurrence[] = [];
  const parentIds = new Set<string>();
  for (const item of items) {
    occurrences.push(item);
    for (const child of item.Children?.Metadata ?? []) {
      occurrences.push({
        ...child,
        parentRatingKey: child.parentRatingKey ?? item.ratingKey,
        librarySectionID: item.librarySectionID,
      });
      if (child.ratingKey === id && item.ratingKey !== id) parentIds.add(item.ratingKey);
    }
    const onDeck = item.OnDeck?.Metadata;
    if (onDeck) {
      occurrences.push(onDeck);
      if (onDeck.ratingKey === id && item.ratingKey !== id) parentIds.add(item.ratingKey);
    }
  }
  const matches = occurrences.filter((item) => item.ratingKey === id);
  for (const item of matches) {
    if (item.parentRatingKey) parentIds.add(item.parentRatingKey);
    if (item.grandparentRatingKey) parentIds.add(item.grandparentRatingKey);
  }
  // A cached season can supply the grandparent missing from a child projection.
  for (const item of occurrences) {
    if (!parentIds.has(item.ratingKey)) continue;
    if (item.parentRatingKey && item.parentRatingKey !== id) parentIds.add(item.parentRatingKey);
    if (item.grandparentRatingKey && item.grandparentRatingKey !== id)
      parentIds.add(item.grandparentRatingKey);
  }
  const typed = matches.filter((item) => item.type);
  const known = typed.length > 0 && typed.every((item) =>
    item.type === "movie" || item.type === "show" || item.type === "artist" ||
    ((item.type === "season" || item.type === "album") && item.parentRatingKey) ||
    ((item.type === "photo" || item.type === "photoalbum" || item.type === "clip") && item.parentRatingKey) ||
    ((item.type === "episode" || item.type === "track") && item.parentRatingKey && (
      item.grandparentRatingKey || matches.some((other) =>
        other.parentRatingKey === item.parentRatingKey && other.grandparentRatingKey,
      ) || occurrences.some((parent) =>
        parent.ratingKey === item.parentRatingKey && parent.parentRatingKey,
      )
    )),
  );
  return {
    found: matches.length > 0,
    sectionId: matches.find((item) => item.librarySectionID)?.librarySectionID?.toString(),
    parentIds: [...parentIds],
    parentScopeUnknown: !known,
  };
}
