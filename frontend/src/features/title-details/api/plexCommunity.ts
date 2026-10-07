import axios from "axios";
import { AuthStorage } from "features/session/model";

export interface PlexReview {
  id: string;
  date: string;
  rating?: number | null;
  reviewRating?: number | null;
  message?: string | null;
  status?: string;
  hasSpoilers?: boolean;
  userV2?: {
    id?: string;
    username: string;
    displayName?: string;
    avatar?: string;
  };
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
    userV2 { id username displayName avatar }
    ... on ActivityRating { rating }
    ... on ActivityWatchRating { rating }
    ... on ActivityReview { reviewRating: rating hasSpoilers message status }
    ... on ActivityWatchReview { reviewRating: rating hasSpoilers message status }
  }
`;

async function request<T>(
  operationName: string,
  query: string,
  variables: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<T> {
  const token = AuthStorage.getProfileAccountToken();
  if (!token) throw new Error("The active Plex profile session has expired.");
  const response = await axios.post<{
    data?: T;
    errors?: { message?: string }[];
  }>(
    "https://community.plex.tv/api",
    { operationName, query, variables },
    { headers: { "X-Plex-Token": token }, timeout: 8000, signal },
  );
  if (response.data.errors?.length)
    throw new Error(
      response.data.errors[0].message || "Plex could not complete the request.",
    );
  if (!response.data.data)
    throw new Error("Plex returned an invalid reviews response.");
  return response.data.data;
}

export async function getPlexReviews(
  metadataID: string,
  signal?: AbortSignal,
): Promise<PlexReviews> {
  const data = await request<PlexReviews>(
    "getRatingsAndReviewsPageData",
    query,
    { metadataID },
    signal,
  );
  if (
    ![data.friendReviews, data.recentReviews, data.topReviews].every(
      (section) => Array.isArray(section?.nodes),
    )
  )
    throw new Error("Plex community reviews are temporarily unavailable.");
  return data;
}

export interface PlexReviewInput {
  metadata: string;
  message: string;
  hasSpoilers: boolean;
  rating: number | null;
}

export async function savePlexReview(
  input: PlexReviewInput,
  reviewID?: string,
  signal?: AbortSignal,
): Promise<PlexReview> {
  const operation = reviewID ? "updateReview" : "createReview";
  const query = reviewID
    ? `mutation updateReview($id: ID!, $input: UpdateReviewInput!) {
        updateReview(id: $id, input: $input) { ...savedReview }
      }`
    : `mutation createReview($input: CreateReviewInput!) {
        createReview(input: $input) { ...savedReview }
      }`;
  const data = await request<Record<string, PlexReview>>(
    operation,
    `${query}
    fragment savedReview on ActivityReview {
      id date reviewRating: rating message hasSpoilers status
      userV2 { id username displayName avatar }
    }
  `,
    { input, ...(reviewID ? { id: reviewID } : {}) },
    signal,
  );
  const saved = data[operation];
  if (!saved || typeof saved.id !== "string")
    throw new Error("Plex did not confirm that your review was saved.");
  return saved;
}
