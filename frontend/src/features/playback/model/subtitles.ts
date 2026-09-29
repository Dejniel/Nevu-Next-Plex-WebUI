import { getTrackChoices } from "entities/media/model";
import type { TrackChoice } from "entities/media/model";

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

export function defaultSubtitleSearchTitle(file?: string) {
  if (!file) return "";
  const filename = file.split(/[\\/]/).pop() || "";
  return filename.replace(/\.[^.]+$/, "");
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
