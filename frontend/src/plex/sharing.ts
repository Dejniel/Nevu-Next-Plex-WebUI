import axios from "axios";
import { AuthStorage } from "../auth/AuthStorage";
import { getBackendURL } from "../backendURL";

export interface SharingLibrary {
  id: string;
  title: string;
  type: string;
}

export interface PlexShare {
  id: number;
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

export interface NewShareInput extends ShareInput {
  invitedAccount: string;
}

export class SharingError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "SharingError";
  }
}

function headers() {
  const token = AuthStorage.getOwnerToken();
  if (!token)
    throw new SharingError("The Plex owner session has expired. Sign in again.", 401);

  return {
    "X-Plex-Token": token,
    "X-Plex-Client-Identifier": localStorage.getItem("clientID") || "nevu-web",
  };
}

function sharingError(error: unknown): SharingError {
  if (!axios.isAxiosError(error))
    return new SharingError("Nevu could not update Plex sharing.");

  const message =
    typeof error.response?.data?.error === "string"
      ? error.response.data.error
      : "Nevu could not update Plex sharing.";
  return new SharingError(message, error.response?.status);
}

export async function getSharingOverview(): Promise<SharingOverview> {
  try {
    const response = await axios.get(`${getBackendURL()}/sharing`, { headers: headers() });
    return response.data as SharingOverview;
  } catch (error) {
    if (error instanceof SharingError) throw error;
    throw sharingError(error);
  }
}

export async function createShare(input: NewShareInput): Promise<void> {
  try {
    await axios.post(`${getBackendURL()}/sharing`, input, { headers: headers() });
  } catch (error) {
    if (error instanceof SharingError) throw error;
    throw sharingError(error);
  }
}

export async function updateShare(id: number, input: ShareInput): Promise<void> {
  try {
    await axios.put(`${getBackendURL()}/sharing/${id}`, input, { headers: headers() });
  } catch (error) {
    if (error instanceof SharingError) throw error;
    throw sharingError(error);
  }
}

export async function deleteShare(id: number): Promise<void> {
  try {
    await axios.delete(`${getBackendURL()}/sharing/${id}`, { headers: headers() });
  } catch (error) {
    if (error instanceof SharingError) throw error;
    throw sharingError(error);
  }
}
