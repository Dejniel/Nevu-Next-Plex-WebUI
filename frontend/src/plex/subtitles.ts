import { AuthStorage } from "../auth/AuthStorage";
import { ProxiedRequest } from "../backendURL";
import { TrackChoice, getTrackChoices } from "./mediaVersions";

export type SubtitleSearchPreference = 0 | 1 | 2 | 3;

export interface SubtitleSearchCriteria {
  language: string;
  title?: string;
  mediaItemID: number;
  hearingImpaired: SubtitleSearchPreference;
  forced: SubtitleSearchPreference;
}

export interface SubtitleSearchResult {
  id: number;
  key: string;
  streamType: 3;
  codec: string;
  language?: string;
  languageTag?: string;
  languageCode: string;
  providerTitle?: string;
  score?: string | number;
  title: string;
  displayTitle?: string;
  extendedDisplayTitle?: string;
  hearingImpaired?: boolean;
  forced?: boolean;
  perfectMatch?: boolean;
  downloaded?: boolean;
}

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

export function defaultSubtitleSearchTitle(file?: string) {
  if (!file) return "";
  const filename = file.split(/[\\/]/).pop() || "";
  return filename.replace(/\.[^.]+$/, "");
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

export function findAttachedSubtitle(
  metadata: Plex.Metadata,
  mediaItemID: number,
  result: SubtitleSearchResult,
): TrackChoice | undefined {
  const choices = getTrackChoices(metadata, 3).filter(
    (choice) => choice.media.id === mediaItemID,
  );

  return choices.find(
    (choice) =>
      choice.stream.id === result.id ||
      (choice.stream.title === result.title &&
        choice.stream.languageCode === result.languageCode),
  );
}
