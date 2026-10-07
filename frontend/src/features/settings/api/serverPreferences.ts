import axios from "axios";
import type { PlexPreference, PreferenceChanges } from "@nevu/contracts";
import { getBackendURL } from "shared/api/backend";

function preferenceError(error: unknown): Error {
  if (
    axios.isAxiosError(error) &&
    typeof error.response?.data?.error === "string"
  )
    return new Error(error.response.data.error);
  return error instanceof Error
    ? error
    : new Error("Plex server preferences request failed.");
}

export async function getServerPreferences(
  token: string,
  signal: AbortSignal,
): Promise<PlexPreference[]> {
  try {
    const response = await axios.get(`${getBackendURL()}/server-preferences`, {
      headers: { "X-Plex-Token": token },
      signal,
    });
    return response.data.preferences;
  } catch (error) {
    throw preferenceError(error);
  }
}

export async function updateServerPreferences(
  token: string,
  preferences: PreferenceChanges,
  signal: AbortSignal,
): Promise<PreferenceChanges> {
  try {
    const response = await axios.put(
      `${getBackendURL()}/server-preferences`,
      { preferences },
      {
        headers: { "X-Plex-Token": token },
        signal,
      },
    );
    return response.data.changes;
  } catch (error) {
    throw preferenceError(error);
  }
}
