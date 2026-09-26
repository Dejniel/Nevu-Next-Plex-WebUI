import axios from "axios";
import { AuthStorage } from "../auth/AuthStorage";
import { getBackendURL } from "../backendURL";

export type ManagedLibraryType = "movie" | "show" | "artist" | "photo" | "video";
export type LibraryAction = "scan" | "refresh-metadata" | "analyze" | "empty-trash";

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

export interface LibraryPreference {
  id: string;
  label: string;
  summary: string;
  type: string;
  value: unknown;
  default: unknown;
  enumValues: string;
  hidden: boolean;
}

export interface LibraryDetails {
  library: ManagedLibrary;
  preferences: LibraryPreference[];
}

export interface LibraryFolder {
  key: string;
  title: string;
  path: string;
}

export interface LibraryInput {
  name: string;
  type?: ManagedLibraryType;
  language: string;
  locations: string[];
  preferences?: Record<string, string>;
}

export class LibraryManagementError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "LibraryManagementError";
  }
}

function headers() {
  const token = AuthStorage.getProfileAccountToken();
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

export async function getManagedLibraries(): Promise<ManagedLibrary[]> {
  try {
    const response = await axios.get(`${getBackendURL()}/libraries`, {
      headers: headers(),
    });
    return response.data.libraries as ManagedLibrary[];
  } catch (error) {
    throw managementError(error);
  }
}

export async function getManagedLibrary(id: string): Promise<LibraryDetails> {
  try {
    const response = await axios.get(`${getBackendURL()}/libraries/${id}`, {
      headers: headers(),
    });
    return response.data as LibraryDetails;
  } catch (error) {
    throw managementError(error);
  }
}

export async function browseLibraryFolders(key?: string): Promise<LibraryFolder[]> {
  try {
    const response = await axios.get(`${getBackendURL()}/libraries/browse`, {
      headers: headers(),
      params: key ? { key } : undefined,
    });
    return response.data.paths as LibraryFolder[];
  } catch (error) {
    throw managementError(error);
  }
}

export async function createLibrary(input: LibraryInput): Promise<void> {
  try {
    await axios.post(`${getBackendURL()}/libraries`, input, { headers: headers() });
  } catch (error) {
    throw managementError(error);
  }
}

export async function updateLibrary(id: string, input: LibraryInput): Promise<void> {
  try {
    await axios.put(`${getBackendURL()}/libraries/${id}`, input, {
      headers: headers(),
    });
  } catch (error) {
    throw managementError(error);
  }
}

export async function deleteLibrary(id: string, confirmTitle: string): Promise<void> {
  try {
    await axios.delete(`${getBackendURL()}/libraries/${id}`, {
      headers: headers(),
      data: { confirmTitle },
    });
  } catch (error) {
    throw managementError(error);
  }
}

export async function runLibraryAction(id: string, action: LibraryAction): Promise<void> {
  try {
    await axios.post(
      `${getBackendURL()}/libraries/${id}/${action}`,
      undefined,
      { headers: headers() },
    );
  } catch (error) {
    throw managementError(error);
  }
}
