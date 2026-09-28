import type { LibraryPageDto, LibraryPageRequest } from "@nevu/contracts";
import axios from "axios";
import { AuthStorage } from "../auth/AuthStorage";
import { getBackendURL } from "../backendURL";

export const PLEX_SESSION_INVALID_EVENT = "nevu:plex-session-invalid";

export class LibraryPageError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "LibraryPageError";
  }
}

export async function getLibraryPage(
  request: LibraryPageRequest,
): Promise<LibraryPageDto> {
  const token = AuthStorage.getServerToken();
  if (!token)
    throw new LibraryPageError("The active Plex session is missing", false, 401);

  try {
    const response = await axios.get<LibraryPageDto>(
      `${getBackendURL()}/library-page`,
      {
        params: request,
        headers: { "X-Plex-Token": token },
      },
    );
    return response.data;
  } catch (error) {
    if (!axios.isAxiosError(error))
      throw new LibraryPageError("Unable to load the Plex library", true);

    const status = error.response?.status;
    const response = error.response?.data as {
      error?: unknown;
      retryable?: unknown;
    } | undefined;
    const message = typeof response?.error === "string"
      ? response.error
      : "Unable to load the Plex library";
    const retryable = typeof response?.retryable === "boolean"
      ? response.retryable
      : !status || status >= 500;

    if (status === 401)
      window.dispatchEvent(new Event(PLEX_SESSION_INVALID_EVENT));
    throw new LibraryPageError(message, retryable, status);
  }
}
