import { platformCache } from "common/DesktopApp";
import { getMediaVersions } from "entities/media/model";
import type { MediaVersion } from "entities/media/model";
import { getXPlexProps, queryBuilder } from "plex/QuickFunctions";
import { getBackendURL } from "shared/api/backend";
import type { PlaybackQuality } from "../model/playbackQuality";
import { getStreamProps } from "./playback";

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
