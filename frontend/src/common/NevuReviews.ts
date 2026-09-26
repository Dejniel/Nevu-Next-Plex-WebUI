import axios from "axios";
import { AuthStorage } from "../auth/AuthStorage";
import { getBackendURL } from "../backendURL";

export class ReviewError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "ReviewError";
  }
}

function headers() {
  const token = AuthStorage.getProfileAccountToken();
  if (!token)
    throw new ReviewError(
      "The active Plex profile session has expired. Sign in again.",
      401,
    );

  return {
    "X-Plex-Token": token,
    "X-Plex-Client-Identifier": localStorage.getItem("clientID") || "nevu-web",
  };
}

function reviewError(error: unknown, fallback: string): ReviewError {
  if (!axios.isAxiosError(error)) return new ReviewError(fallback);
  const message =
    typeof error.response?.data?.error === "string"
      ? error.response.data.error
      : fallback;
  return new ReviewError(message, error.response?.status);
}

export async function getNevuReviews(
  itemID: string,
  userID?: string,
): Promise<PerPlexed.Reviews.Review[]> {
  try {
    const response = await axios.get(`${getBackendURL()}/reviews`, {
      params: { itemID, ...(userID ? { userID } : {}) },
      headers: headers(),
    });
    if (!Array.isArray(response.data))
      throw new ReviewError("Nevu returned an invalid reviews response.");
    return response.data as PerPlexed.Reviews.Review[];
  } catch (error) {
    if (error instanceof ReviewError) throw error;
    throw reviewError(error, "Nevu could not load reviews.");
  }
}

export async function updateNevuReview(
  itemID: string,
  rating: number,
  message: string,
  visibility: PerPlexed.Reviews.Visibility,
  spoilers: boolean,
): Promise<void> {
  try {
    await axios.post(
      `${getBackendURL()}/reviews`,
      { itemID, rating, message, visibility, spoilers },
      { headers: headers() },
    );
  } catch (error) {
    if (error instanceof ReviewError) throw error;
    throw reviewError(error, "Nevu could not save the review.");
  }
}

export async function deleteNevuReview(
  itemID: string,
  visibility: PerPlexed.Reviews.Visibility,
): Promise<void> {
  try {
    await axios.delete(`${getBackendURL()}/reviews`, {
      params: { itemID, visibility },
      headers: headers(),
    });
  } catch (error) {
    if (error instanceof ReviewError) throw error;
    throw reviewError(error, "Nevu could not delete the review.");
  }
}
