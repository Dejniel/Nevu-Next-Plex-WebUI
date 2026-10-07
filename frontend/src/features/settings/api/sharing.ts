import axios from "axios";
import { AuthStorage } from "features/session/model";
import { getBackendURL } from "shared/api/backend";

export interface SharingLibrary {
  id: string;
  title: string;
  type: string;
}

export interface PlexShare {
  id: number;
  userId: number | null;
  displayName: string;
  account: string | null;
  home: boolean;
  status: "active" | "pending";
  librarySectionIds: string[];
  allLibraries: boolean;
  allowDownloads: boolean;
}

export interface SharingOverview {
  libraries: SharingLibrary[];
  shares: PlexShare[];
}

export interface ShareInput {
  librarySectionIds: string[];
  allowDownloads: boolean;
}

export type NewShareInput = ShareInput &
  ({ invitedAccount: string } | { invitedId: number });

export class SharingError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "SharingError";
  }
}

function headers() {
  const token = AuthStorage.getProfileAccountToken();
  if (!token)
    throw new SharingError(
      "The active Plex manager session has expired. Sign in again.",
      401,
    );

  return {
    "X-Plex-Token": token,
    "X-Plex-Client-Identifier": localStorage.getItem("clientID") || "nevu-web",
  };
}

function sharingError(error: unknown): Error {
  if (axios.isCancel(error))
    return new DOMException("Sharing request cancelled", "AbortError");
  if (!axios.isAxiosError(error))
    return new SharingError("Nevu could not update Plex sharing.");

  const message =
    typeof error.response?.data?.error === "string"
      ? error.response.data.error
      : "Nevu could not update Plex sharing.";
  return new SharingError(message, error.response?.status);
}

export async function getSharingOverview(
  signal?: AbortSignal,
): Promise<SharingOverview> {
  try {
    const response = await axios.get(`${getBackendURL()}/sharing`, {
      headers: headers(),
      signal,
    });
    return response.data as SharingOverview;
  } catch (error) {
    if (error instanceof SharingError) throw error;
    throw sharingError(error);
  }
}

export async function createShare(
  input: NewShareInput,
  signal?: AbortSignal,
): Promise<void> {
  try {
    await axios.post(`${getBackendURL()}/sharing`, input, {
      headers: headers(),
      signal,
    });
  } catch (error) {
    if (error instanceof SharingError) throw error;
    throw sharingError(error);
  }
}

export async function updateShare(
  id: number,
  input: ShareInput,
  signal?: AbortSignal,
): Promise<void> {
  try {
    await axios.put(`${getBackendURL()}/sharing/${id}`, input, {
      headers: headers(),
      signal,
    });
  } catch (error) {
    if (error instanceof SharingError) throw error;
    throw sharingError(error);
  }
}

export async function deleteShare(
  id: number,
  signal?: AbortSignal,
): Promise<void> {
  try {
    await axios.delete(`${getBackendURL()}/sharing/${id}`, {
      headers: headers(),
      signal,
    });
  } catch (error) {
    if (error instanceof SharingError) throw error;
    throw sharingError(error);
  }
}
