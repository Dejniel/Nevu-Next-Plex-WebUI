import type {
  LibraryPageDto,
  LibraryPageRequest,
  LibraryItemUpdateDto,
} from "@nevu/contracts";
import { readMediaMetadata, type MediaItemUpdate } from "entities/media/model";
import axios from "axios";
import {
  AuthStorage,
  PLEX_SESSION_INVALID_EVENT,
} from "features/session/model";
import { getBackendURL } from "shared/api/backend";
import { normalizeLibraryFilterExpression } from "../model/libraryFilterExpression";

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
  signal?: AbortSignal,
): Promise<LibraryPageDto> {
  const token = AuthStorage.getServerToken();
  if (!token)
    throw new LibraryPageError(
      "The active Plex session is missing",
      false,
      401,
    );

  try {
    const { filterExpression, ...params } = request;
    const response = await axios.get<LibraryPageDto>(
      `${getBackendURL()}/library-page`,
      {
        params: {
          ...params,
          ...(filterExpression && {
            filterExpression: JSON.stringify(
              normalizeLibraryFilterExpression(filterExpression),
            ),
          }),
        },
        headers: { "X-Plex-Token": token },
        ...(signal && { signal }),
      },
    );
    return response.data;
  } catch (error) {
    if (axios.isCancel(error)) throw error;
    if (!axios.isAxiosError(error))
      throw new LibraryPageError("Unable to load the Plex library", true);

    const status = error.response?.status;
    const response = error.response?.data as
      | {
          error?: unknown;
          retryable?: unknown;
        }
      | undefined;
    const message =
      typeof response?.error === "string"
        ? response.error
        : "Unable to load the Plex library";
    const retryable =
      typeof response?.retryable === "boolean"
        ? response.retryable
        : !status || status >= 500;

    if (status === 401)
      window.dispatchEvent(new Event(PLEX_SESSION_INVALID_EVENT));
    throw new LibraryPageError(message, retryable, status);
  }
}

export async function synchronizeLibraryItem(
  id: string,
  signal: AbortSignal,
  includeDetails = false,
): Promise<MediaItemUpdate> {
  const response = await axios.post<LibraryItemUpdateDto>(
    `${getBackendURL()}/library-page/synchronize`,
    null,
    {
      params: { id, ...(includeDetails && { includeDetails: "true" }) },
      signal,
      headers: { "X-Plex-Token": AuthStorage.getServerToken() },
    },
  );
  const { metadata, ...update } = response.data;
  return {
    ...update,
    ...(metadata !== undefined && {
      metadata: readMediaMetadata(metadata, id),
    }),
  };
}

export async function invalidateRandomCatalogs(
  sectionId: string | undefined,
  signal: AbortSignal,
) {
  await axios.delete(`${getBackendURL()}/library-page/catalog`, {
    params: { sectionId },
    signal,
    headers: { "X-Plex-Token": AuthStorage.getServerToken() },
  });
}
