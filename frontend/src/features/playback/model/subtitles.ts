import {
  type MediaMetadata,
  type MediaVersion,
  getTrackChoices,
} from "entities/media/model";
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
  id?: number;
  key: string;
  streamType: 3;
  codec?: string;
  sourceKey?: string;
  language?: string;
  languageTag?: string;
  languageCode?: string;
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

export type SubtitleAttachment =
  | { type: "download"; subtitle: SubtitleSearchResult }
  | { type: "upload"; filename: string };

export const SUBTITLE_FILE_ACCEPT = ".srt,.vtt,.ass,.ssa,.smi";

export function subtitleFileFormat(file: File) {
  const format = file.name.split(".").pop()?.toLowerCase();
  if (!format || !SUBTITLE_FILE_ACCEPT.split(",").includes(`.${format}`))
    throw new Error("Choose an SRT, VTT, ASS, SSA or SMI subtitle file.");
  if (!file.size) throw new Error("The subtitle file is empty.");
  return format;
}

export function defaultSubtitleSearchTitle(file?: string) {
  if (!file) return "";
  const filename = file.split(/[\\/]/).pop() || "";
  return filename.replace(/\.[^.]+$/, "");
}

export function findAttachedSubtitle(
  metadata: MediaMetadata,
  version: MediaVersion,
  attachment: SubtitleAttachment,
): TrackChoice | undefined {
  const choices = getTrackChoices(metadata, 3).filter(
    (choice) =>
      choice.media.id === version.media.id &&
      choice.part.id === version.part.id &&
      Boolean(choice.stream.key),
  );
  const known = new Set(version.part.Stream?.map((stream) => stream.id));
  if (attachment.type === "upload") {
    // PMS strips the extension from the uploaded filename. Each upload gets a
    // new stream ID, including when the same filename was uploaded before.
    const title = defaultSubtitleSearchTitle(attachment.filename);
    const added = choices.filter(
      ({ stream }) => !known.has(stream.id) && stream.title === title,
    );
    return added.length === 1 ? added[0] : undefined;
  }
  const result = attachment.subtitle;
  // Search IDs identify temporary provider results, not attached library streams.
  const sourceKey = result.sourceKey ?? result.key;
  const exact = choices.find(
    (choice) =>
      choice.stream.sourceKey === sourceKey || choice.stream.key === result.key,
  );
  if (exact) return exact;
  // Older providers can omit sourceKey. Only a single newly attached matching
  // stream is safe; do not select an existing or ambiguous release by its title.
  const added = choices.filter(
    ({ stream }) =>
      !known.has(stream.id) &&
      (!stream.sourceKey || !result.sourceKey) &&
      (!result.languageCode || stream.languageCode === result.languageCode) &&
      (!result.codec || stream.codec === result.codec) &&
      (!stream.title || stream.title === result.title),
  );
  return added.length === 1 ? added[0] : undefined;
}

export async function waitForAttachedSubtitle(
  load: () => Promise<MediaMetadata>,
  version: MediaVersion,
  attachment: SubtitleAttachment,
  signal: AbortSignal,
) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    signal.throwIfAborted();
    const metadata = await load();
    signal.throwIfAborted();
    const choice = findAttachedSubtitle(metadata, version, attachment);
    if (choice) return { metadata, choice };
    await new Promise<void>((resolve, reject) => {
      const abort = () => {
        clearTimeout(timer);
        reject(signal.reason);
      };
      const timer = setTimeout(() => {
        signal.removeEventListener("abort", abort);
        resolve();
      }, 500);
      signal.addEventListener("abort", abort, { once: true });
    });
  }
  throw new Error(
    "Plex accepted the subtitle, but it did not become available in time.",
  );
}
