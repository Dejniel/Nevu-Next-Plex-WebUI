import axios from "axios";
import type { PlexPreference, PreferenceChanges } from "@nevu/contracts";
import { AuthStorage } from "features/session/model";
import { getBackendURL } from "shared/api/backend";

export type ManagedLibraryType =
  | "movie"
  | "show"
  | "artist"
  | "photo"
  | "video";
export type LibraryAction =
  | "scan"
  | "refresh-metadata"
  | "analyze"
  | "empty-trash";

export interface ManagedLibrary {
  id: string;
  uuid: string;
  title: string;
  type: string;
  agent: string;
  scanner: string;
  language: string;
  refreshing: boolean;
  updatedAt: number | null;
  scannedAt: number | null;
  locations: string[];
}

export interface LibraryDetails {
  library: ManagedLibrary;
  preferences: PlexPreference[];
}

export interface LibraryFolder {
  key: string;
  title: string;
  path: string;
}

export interface LibraryInput {
  name: string;
  type: ManagedLibraryType;
  language: string;
  locations: string[];
}

export type LibraryUpdateInput = Partial<Omit<LibraryInput, "type">> & {
  preferences?: PreferenceChanges;
};

export interface LibraryRequest {
  token?: string;
  signal?: AbortSignal;
}

export class LibraryManagementError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "LibraryManagementError";
  }
}

function headers(token = AuthStorage.getProfileAccountToken()) {
  if (!token)
    throw new LibraryManagementError(
      "The active Plex manager session has expired. Sign in again.",
      401,
    );

  return {
    "X-Plex-Token": token,
    "X-Plex-Client-Identifier": localStorage.getItem("clientID") || "nevu-web",
  };
}

function managementError(error: unknown) {
  if (error instanceof LibraryManagementError) return error;
  if (!axios.isAxiosError(error))
    return new LibraryManagementError("Nevu could not manage Plex libraries.");
  const message =
    typeof error.response?.data?.error === "string"
      ? error.response.data.error
      : "Nevu could not manage Plex libraries.";
  return new LibraryManagementError(message, error.response?.status);
}

export async function getManagedLibraries(
  options: LibraryRequest = {},
): Promise<ManagedLibrary[]> {
  try {
    const response = await axios.get(`${getBackendURL()}/libraries`, {
      headers: headers(options.token),
      signal: options.signal,
    });
    return response.data.libraries as ManagedLibrary[];
  } catch (error) {
    throw managementError(error);
  }
}

export async function getManagedLibrary(
  id: string,
  options: LibraryRequest = {},
): Promise<LibraryDetails> {
  try {
    const response = await axios.get(
      `${getBackendURL()}/libraries/${encodeURIComponent(id)}`,
      {
        headers: headers(options.token),
        signal: options.signal,
      },
    );
    return response.data as LibraryDetails;
  } catch (error) {
    throw managementError(error);
  }
}

export async function browseLibraryFolders(
  key?: string,
  options: LibraryRequest = {},
): Promise<LibraryFolder[]> {
  try {
    const response = await axios.get(`${getBackendURL()}/libraries/browse`, {
      headers: headers(options.token),
      signal: options.signal,
      params: key ? { key } : undefined,
    });
    return response.data.paths as LibraryFolder[];
  } catch (error) {
    throw managementError(error);
  }
}

export async function createLibrary(
  input: LibraryInput,
  options: LibraryRequest = {},
): Promise<void> {
  try {
    await axios.post(`${getBackendURL()}/libraries`, input, {
      headers: headers(options.token),
      signal: options.signal,
    });
  } catch (error) {
    throw managementError(error);
  }
}

export async function updateLibrary(
  id: string,
  input: LibraryUpdateInput,
  options: LibraryRequest = {},
): Promise<void> {
  try {
    await axios.put(
      `${getBackendURL()}/libraries/${encodeURIComponent(id)}`,
      input,
      {
        headers: headers(options.token),
        signal: options.signal,
      },
    );
  } catch (error) {
    throw managementError(error);
  }
}

export async function deleteLibrary(
  id: string,
  confirmTitle: string,
  options: LibraryRequest = {},
): Promise<void> {
  try {
    await axios.delete(
      `${getBackendURL()}/libraries/${encodeURIComponent(id)}`,
      {
        headers: headers(options.token),
        signal: options.signal,
        data: { confirmTitle },
      },
    );
  } catch (error) {
    throw managementError(error);
  }
}

export async function runLibraryAction(
  id: string,
  action: LibraryAction,
  options: LibraryRequest = {},
): Promise<void> {
  try {
    await axios.post(
      `${getBackendURL()}/libraries/${encodeURIComponent(id)}/${action}`,
      undefined,
      { headers: headers(options.token), signal: options.signal },
    );
  } catch (error) {
    throw managementError(error);
  }
}
