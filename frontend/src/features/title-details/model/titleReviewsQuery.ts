import { queryOptions } from "@tanstack/react-query";
import { getPlexReviews } from "../api/plexCommunity";

export function getReviewMetadataID(guid?: string) {
  return guid?.match(/^plex:\/\/(?:movie|show|season|episode)\/([^/]+)$/)?.[1];
}

export function titleReviewsQueryOptions(profileKey: string, guid?: string) {
  const metadataID = getReviewMetadataID(guid);
  return queryOptions({
    queryKey: ["title-reviews", profileKey, metadataID] as const,
    queryFn: ({ signal }) => getPlexReviews(metadataID!, signal),
    enabled: Boolean(profileKey && metadataID),
  });
}
