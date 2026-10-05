import axios from "axios";
import { AuthStorage } from "features/session/model";

export interface PlexReview {
  id: string;
  date: string;
  rating?: number;
  reviewRating?: number;
  message?: string;
  hasSpoilers?: boolean;
  userV2?: { username: string; displayName?: string; avatar?: string };
}

export interface PlexReviews {
  userReview: PlexReview | null;
  friendReviews: { nodes: PlexReview[] };
  recentReviews: { nodes: PlexReview[] };
  topReviews: { nodes: PlexReview[] };
}

const query = `
  query getRatingsAndReviewsPageData($metadataID: ID!) {
    userReview: metadataReviewV2(metadata: {id: $metadataID}, ignoreFutureMetadata: true) {
      ...reviews
    }
    friendReviews: metadataReviewsV2(metadata: {id: $metadataID}, type: FRIENDS, first: 25) {
      nodes { ...reviews }
    }
    recentReviews: metadataReviewsV2(metadata: {id: $metadataID}, type: RECENT, first: 25) {
      nodes { ...reviews }
    }
    topReviews: metadataReviewsV2(metadata: {id: $metadataID}, type: TOP, first: 25) {
      nodes { ...reviews }
    }
  }
  fragment reviews on Activity {
    id
    date
    userV2 { username displayName avatar }
    ... on ActivityRating { rating }
    ... on ActivityWatchRating { rating }
    ... on ActivityReview { reviewRating: rating hasSpoilers message }
    ... on ActivityWatchReview { reviewRating: rating hasSpoilers message }
  }
`;

export async function getPlexReviews(
  metadataID: string,
  signal?: AbortSignal,
): Promise<PlexReviews> {
  const token = AuthStorage.getProfileAccountToken();
  if (!token) throw new Error("The active Plex profile session has expired.");
  const response = await axios.post<{ data?: PlexReviews; errors?: unknown[] }>(
    "https://community.plex.tv/api",
    {
      operationName: "getRatingsAndReviewsPageData",
      variables: { metadataID },
      query,
    },
    { headers: { "X-Plex-Token": token }, timeout: 8000, signal },
  );
  const { data, errors } = response.data;
  if (
    errors?.length ||
    !data ||
    ![data.friendReviews, data.recentReviews, data.topReviews].every(
      (section) => Array.isArray(section?.nodes),
    )
  )
    throw new Error("Plex community reviews are temporarily unavailable.");
  return data;
}
