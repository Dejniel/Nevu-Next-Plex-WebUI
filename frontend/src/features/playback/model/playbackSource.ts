import { platformCache } from "common/DesktopApp";
import { getMediaVersions, MediaVersion } from "entities/media/model";
import { getXPlexProps, queryBuilder } from "plex/QuickFunctions";
import { getBackendURL } from "shared/api/backend";
import { getStreamProps } from "../api/playback";

export interface PlaybackQuality {
  bitrate?: number;
  auto?: boolean;
}

export function parseStoredPlaybackQuality(value: string | null) {
  if (!value) return {};
  const bitrate = Number.parseInt(value, 10);
  return Number.isFinite(bitrate) ? { bitrate } : {};
}

export function persistPlaybackQuality(quality: PlaybackQuality) {
  if (quality.bitrate === undefined) localStorage.removeItem("quality");
  else localStorage.setItem("quality", quality.bitrate.toString());
}

export function buildPlaybackSourceUrl(
  metadata: Plex.Metadata,
  quality: PlaybackQuality,
  version?: MediaVersion,
) {
  const selected = version || getMediaVersions(metadata)[0];
  if (quality.bitrate === -1 && selected) {
    return `${getBackendURL()}/dynproxy${selected.part.key}?${queryBuilder({
      ...getXPlexProps(),
    })}`;
  }

  const extension = platformCache.isDesktop ? "m3u8" : "mpd";
  return `${getBackendURL()}/dynproxy/video/:/transcode/universal/start.${extension}?${queryBuilder(
    {
      ...getStreamProps(metadata.ratingKey, {
        ...(quality.bitrate !== undefined && {
          maxVideoBitrate: quality.bitrate,
        }),
        autoAdjustQuality: quality.auto,
        mediaIndex: selected?.mediaIndex ?? 0,
        partIndex: selected?.partIndex ?? 0,
      }),
    },
  )}`;
}
