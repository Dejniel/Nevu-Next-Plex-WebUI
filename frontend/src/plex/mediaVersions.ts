export interface TrackPreference {
  index: number;
  title: string;
  languageCode?: string;
  codec?: string;
}

export interface MediaVersion {
  mediaIndex: number;
  partIndex: number;
  media: Plex.Media;
  part: Plex.Part;
}

export interface TrackChoice extends MediaVersion {
  stream: Plex.Stream;
}

export function getMediaVersions(data: Plex.Metadata): MediaVersion[] {
  return (data.Media || []).flatMap((media, mediaIndex) => {
    const part = media.Part?.[0];
    return part ? [{ mediaIndex, partIndex: 0, media, part }] : [];
  });
}

export function getTrackChoices(
  data: Plex.Metadata,
  streamType: 2 | 3,
): TrackChoice[] {
  return getMediaVersions(data).flatMap((version) =>
    (version.part.Stream || [])
      .filter((stream) => stream.streamType === streamType)
      .map((stream) => ({ ...version, stream })),
  );
}

export function parseTrackPreference(value?: string): TrackPreference | null {
  if (!value) return null;
  try {
    const preference = JSON.parse(value) as Partial<TrackPreference>;
    if (typeof preference.index !== "number" || typeof preference.title !== "string")
      return null;
    return preference as TrackPreference;
  } catch {
    return null;
  }
}

export function preferenceFromStream(stream: Plex.Stream): TrackPreference {
  return {
    index: stream.index,
    title: stream.extendedDisplayTitle || stream.displayTitle || stream.title || "",
    ...(stream.languageCode ? { languageCode: stream.languageCode } : {}),
    ...(stream.codec ? { codec: stream.codec } : {}),
  };
}

export function findPreferredStream(
  version: MediaVersion,
  streamType: 2 | 3,
  preference: TrackPreference | null,
): Plex.Stream | undefined {
  if (!preference || preference.index < 0) return undefined;
  const streams = (version.part.Stream || []).filter(
    (stream) => stream.streamType === streamType,
  );
  const title = (stream: Plex.Stream) =>
    stream.extendedDisplayTitle || stream.displayTitle || stream.title || "";

  const titleMatch = streams.find((stream) => title(stream) === preference.title);
  if (titleMatch) return titleMatch;
  if (preference.languageCode) {
    return (
      streams.find(
        (stream) =>
          stream.languageCode === preference.languageCode &&
          (!preference.codec || stream.codec === preference.codec),
      ) ||
      streams.find((stream) => stream.languageCode === preference.languageCode)
    );
  }
  return preference.title
    ? undefined
    : streams.find((stream) => stream.index === preference.index);
}

type MediaQualityData = Pick<
  Plex.Media,
  "bitrate" | "height" | "videoDynamicRange" | "videoResolution" | "width"
>;

function mediaQualityScore(media: MediaQualityData) {
  const resolution = media.videoResolution?.toLowerCase();
  const resolutionHeight = resolution === "4k"
    ? 2160
    : Number.parseInt(resolution || "", 10) || media.height || 0;
  const pixels = (media.width || 0) * (media.height || 0);
  return resolutionHeight * 1_000_000_000 +
    (media.bitrate || 0) * 1_000 +
    pixels / 1_000_000;
}

function qualityScore(version: MediaVersion) {
  return mediaQualityScore(version.media);
}

export function mediaQualityBadge(data: { Media?: MediaQualityData[] }): string | null {
  if (!data.Media?.length) return null;

  const media = data.Media.reduce((best, candidate) =>
    mediaQualityScore(candidate) > mediaQualityScore(best) ? candidate : best,
  );
  const rawResolution = media.videoResolution?.trim();
  const resolution = rawResolution?.toLowerCase() === "4k"
    ? "4K"
    : rawResolution
      ? /^\d+$/.test(rawResolution)
        ? `${rawResolution}p`
        : rawResolution.toUpperCase()
      : media.height
        ? `${media.height}p`
        : null;
  const rawDynamicRange = media.videoDynamicRange?.trim();
  const dynamicRange = !rawDynamicRange || rawDynamicRange.toLowerCase() === "sdr"
    ? null
    : /^(dolby vision|dovi|dv)$/i.test(rawDynamicRange)
      ? "DV"
      : rawDynamicRange.toUpperCase();

  return [resolution, dynamicRange].filter(Boolean).join(" ") || null;
}

export function chooseBestMediaVersion(
  data: Plex.Metadata,
  audioPreference: TrackPreference | null = null,
  subtitlePreference: TrackPreference | null = null,
): MediaVersion | null {
  const versions = getMediaVersions(data);
  if (versions.length === 0) return null;

  return versions.reduce((best, version) => {
    const score =
      (findPreferredStream(version, 2, audioPreference) ? 2_000_000_000_000_000 : 0) +
      (findPreferredStream(version, 3, subtitlePreference) ? 1_000_000_000_000_000 : 0) +
      qualityScore(version);
    const bestScore =
      (findPreferredStream(best, 2, audioPreference) ? 2_000_000_000_000_000 : 0) +
      (findPreferredStream(best, 3, subtitlePreference) ? 1_000_000_000_000_000 : 0) +
      qualityScore(best);
    return score > bestScore ? version : best;
  });
}

export function mediaVersionDetails(version: MediaVersion): string {
  const resolution = version.media.videoResolution
    ? `${version.media.videoResolution}${/^\d+$/.test(version.media.videoResolution) ? "p" : ""}`
    : version.media.height
      ? `${version.media.height}p`
      : null;
  const bitrate = version.media.bitrate
    ? `${(version.media.bitrate / 1000).toFixed(1)} Mb/s`
    : null;
  return [resolution, version.media.videoCodec?.toUpperCase(), bitrate]
    .filter(Boolean)
    .join(" · ");
}
