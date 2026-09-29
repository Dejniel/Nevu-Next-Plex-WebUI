import { AuthStorage } from "auth/AuthStorage";
import { ProxiedRequest } from "shared/api/backend";
import type {
  SubtitleSearchCriteria,
  SubtitleSearchResult,
} from "../model/subtitles";

export class SubtitleSearchError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "SubtitleSearchError";
  }
}

function serverHeaders() {
  const token = AuthStorage.getServerToken();
  if (!token)
    throw new SubtitleSearchError(
      "The Plex session has expired. Sign in again.",
      401,
    );

  return {
    Accept: "application/json",
    "X-Plex-Token": token,
  };
}

function subtitleError(status: number, operation: "search" | "download") {
  if (status === 401 || status === 403)
    return new SubtitleSearchError(
      "This Plex profile cannot search for subtitles.",
      status,
    );
  if (status === 404)
    return new SubtitleSearchError(
      "Subtitle search is not available for this item.",
      status,
    );

  return new SubtitleSearchError(
    operation === "search"
      ? "Plex could not search for subtitles."
      : "Plex could not download this subtitle.",
    status,
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
): Promise<SubtitleSearchResult[]> {
  const response = await ProxiedRequest(
    buildSubtitleSearchPath(ratingKey, criteria),
    "GET",
    serverHeaders(),
  );
  if (response.status < 200 || response.status >= 300)
    throw subtitleError(response.status, "search");

  return (response.data?.MediaContainer?.Stream || []) as SubtitleSearchResult[];
}

export async function downloadSubtitle(
  ratingKey: string,
  mediaItemID: number,
  subtitle: SubtitleSearchResult,
): Promise<void> {
  const response = await ProxiedRequest(
    buildSubtitleDownloadPath(ratingKey, mediaItemID, subtitle),
    "PUT",
    serverHeaders(),
    {},
  );
  if (response.status < 200 || response.status >= 300)
    throw subtitleError(response.status, "download");
}
