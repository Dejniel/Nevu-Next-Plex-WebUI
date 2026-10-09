import { AuthStorage } from "features/session/model";
import { PlexClient, PlexRequestError } from "shared/api/PlexClient";
import type {
  SubtitleSearchCriteria,
  SubtitleSearchResult,
} from "../model/subtitles";

class SubtitleSearchError extends Error {
  constructor(message: string, public readonly status?: number, cause?: unknown) {
    super(message, { cause });
    this.name = "SubtitleSearchError";
  }
}

function subtitleClient() {
  const token = AuthStorage.getServerToken();
  if (!token)
    throw new SubtitleSearchError(
      "The Plex session has expired. Sign in again.",
      401,
    );

  return new PlexClient(() => token);
}

function subtitleError(error: PlexRequestError, operation: "search" | "download") {
  const status = error.status;
  if (status === 401 || status === 403)
    return new SubtitleSearchError(
      "This Plex profile cannot search for subtitles.",
      status,
      error,
    );
  if (status === 404)
    return new SubtitleSearchError(
      "Subtitle search is not available for this item.",
      status,
      error,
    );

  return new SubtitleSearchError(
    operation === "search"
      ? "Plex could not search for subtitles."
      : "Plex could not download this subtitle.",
    status,
    error,
  );
}

export function buildSubtitleSearchPath(
  ratingKey: string,
  criteria: SubtitleSearchCriteria,
) {
  const params = new URLSearchParams({
    language: criteria.language,
    mediaItemID: String(criteria.mediaItemID),
    hearingImpaired: String(criteria.hearingImpaired),
    forced: String(criteria.forced),
  });
  const title = criteria.title?.trim();
  if (title) params.set("title", title);

  return `/library/metadata/${encodeURIComponent(ratingKey)}/subtitles?${params.toString()}`;
}

export function buildSubtitleDownloadPath(
  ratingKey: string,
  mediaItemID: number,
  subtitle: SubtitleSearchResult,
) {
  const params = new URLSearchParams({
    key: subtitle.key,
    codec: subtitle.codec,
    language: subtitle.languageCode,
    hearingImpaired: subtitle.hearingImpaired ? "1" : "0",
    forced: subtitle.forced ? "1" : "0",
    mediaItemID: String(mediaItemID),
  });
  if (subtitle.providerTitle)
    params.set("providerTitle", subtitle.providerTitle);

  return `/library/metadata/${encodeURIComponent(ratingKey)}/subtitles?${params.toString()}`;
}

export async function searchSubtitles(
  ratingKey: string,
  criteria: SubtitleSearchCriteria,
  signal?: AbortSignal,
): Promise<SubtitleSearchResult[]> {
  const client = subtitleClient();
  try {
    const response = await client.get<{
      MediaContainer?: { Stream?: SubtitleSearchResult[] };
    }>(buildSubtitleSearchPath(ratingKey, criteria), signal);
    const container = response?.MediaContainer;
    if (
      !container || typeof container !== "object" || Array.isArray(container) ||
      (container.Stream !== undefined && !Array.isArray(container.Stream))
    )
      throw new SubtitleSearchError("Plex returned invalid subtitle search results.");
    return container.Stream ?? [];
  } catch (error) {
    if (error instanceof PlexRequestError) throw subtitleError(error, "search");
    throw error;
  }
}

export async function downloadSubtitle(
  ratingKey: string,
  mediaItemID: number,
  subtitle: SubtitleSearchResult,
  signal?: AbortSignal,
): Promise<void> {
  const client = subtitleClient();
  try {
    await client.put(buildSubtitleDownloadPath(ratingKey, mediaItemID, subtitle), {}, signal);
  } catch (error) {
    if (error instanceof PlexRequestError) throw subtitleError(error, "download");
    throw error;
  }
}
