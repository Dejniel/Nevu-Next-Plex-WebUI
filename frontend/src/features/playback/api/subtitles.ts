import { AuthStorage } from "features/session/model";
import { PlexClient, PlexRequestError } from "shared/api/PlexClient";
import {
  PlexResponseError,
  plexObject,
  plexContainer,
  plexArray,
  plexString,
  plexInteger,
  plexBoolean,
  plexNumber,
  plexFields,
} from "shared/api/plexResponse";
import type {
  SubtitleSearchCriteria,
  SubtitleSearchResult,
} from "../model/subtitles";
import { subtitleFileFormat } from "../model/subtitles";

class SubtitleError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    cause?: unknown,
  ) {
    super(message, { cause });
    this.name = "SubtitleError";
  }
}

function subtitleClient() {
  const token = AuthStorage.getServerToken();
  if (!token)
    throw new SubtitleError(
      "The Plex session has expired. Sign in again.",
      401,
    );

  return new PlexClient(() => token);
}

function subtitleError(
  error: PlexRequestError,
  operation: "search" | "download" | "upload",
) {
  const status = error.status;
  if (status === 401 || status === 403)
    return new SubtitleError(
      operation === "search"
        ? "This Plex profile cannot search for subtitles."
        : `This Plex profile cannot ${operation} subtitles.`,
      status,
      error,
    );
  if (status === 404)
    return new SubtitleError(
      operation === "search"
        ? "Subtitle search is not available for this item."
        : operation === "upload"
          ? "Subtitle uploads are not available for this item."
          : "This subtitle is no longer available. Search again.",
      status,
      error,
    );

  return new SubtitleError(
    operation === "search"
      ? "Plex could not search for subtitles."
      : `Plex could not ${operation} this subtitle.`,
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
  if (
    !Number.isSafeInteger(mediaItemID) ||
    mediaItemID <= 0 ||
    !subtitle.key.trim()
  )
    throw new SubtitleError("Plex did not identify this subtitle download.");
  const params = new URLSearchParams({
    key: subtitle.key,
    transient: "0",
    mediaItemID: String(mediaItemID),
    hearingImpaired: subtitle.hearingImpaired ? "1" : "0",
    forced: subtitle.forced ? "1" : "0",
  });
  if (subtitle.codec) params.set("codec", subtitle.codec);
  if (subtitle.languageCode) params.set("language", subtitle.languageCode);
  if (subtitle.providerTitle)
    params.set("providerTitle", subtitle.providerTitle);

  return `/library/metadata/${encodeURIComponent(ratingKey)}/subtitles?${params.toString()}`;
}

function readSubtitleSearchResult(value: unknown): SubtitleSearchResult {
  const resource = "subtitle search results";
  const row = plexObject(value, resource);
  const text = (value: unknown) => plexString(value, resource);
  const key = text(row.key);
  if (!key.trim()) throw new PlexResponseError(resource);
  const fields = plexFields(row, {
    id: (value) => plexInteger(value, resource),
    sourceKey: text,
    codec: text,
    language: text,
    languageTag: text,
    languageCode: text,
    providerTitle: text,
    title: text,
    displayTitle: text,
    extendedDisplayTitle: text,
    score: (value) =>
      typeof value === "string" ? value : plexNumber(value, resource),
    hearingImpaired: (value) => plexBoolean(value, resource),
    forced: (value) => plexBoolean(value, resource),
    perfectMatch: (value) => plexBoolean(value, resource),
    downloaded: (value) => plexBoolean(value, resource),
  });
  if (row.streamType !== 3) throw new PlexResponseError(resource);
  return {
    ...fields,
    key,
    streamType: 3,
    title: fields.title ?? fields.displayTitle ?? "Subtitles",
  };
}

export async function searchSubtitles(
  ratingKey: string,
  criteria: SubtitleSearchCriteria,
  signal?: AbortSignal,
): Promise<SubtitleSearchResult[]> {
  const client = subtitleClient();
  try {
    const response = await client.get<unknown>(
      buildSubtitleSearchPath(ratingKey, criteria),
      signal,
    );
    return plexArray(
      plexContainer(response, "subtitle search results").Stream,
      "subtitle search results",
    ).map(readSubtitleSearchResult);
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
    await client.put(
      buildSubtitleDownloadPath(ratingKey, mediaItemID, subtitle),
      undefined,
      signal,
    );
  } catch (error) {
    if (error instanceof PlexRequestError)
      throw subtitleError(error, "download");
    throw error;
  }
}

export async function uploadSubtitle(
  ratingKey: string,
  mediaItemID: number,
  file: File,
  signal?: AbortSignal,
): Promise<void> {
  const format = subtitleFileFormat(file);
  if (!Number.isSafeInteger(mediaItemID) || mediaItemID <= 0)
    throw new SubtitleError("Plex did not identify this media version.");
  const client = subtitleClient();
  const params = new URLSearchParams({
    title: file.name,
    format,
    mediaItemID: String(mediaItemID),
  });
  try {
    await client.upload(
      `/library/metadata/${encodeURIComponent(ratingKey)}/subtitles?${params}`,
      file,
      signal,
    );
  } catch (error) {
    if (error instanceof PlexRequestError) throw subtitleError(error, "upload");
    throw error;
  }
}
