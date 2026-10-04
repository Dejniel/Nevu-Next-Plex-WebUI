import { queryBuilder } from "shared/lib/query";
import {
  playlistReturnPath,
  playlistWatchPath,
  type PlaylistPlaybackContext,
} from "features/media-lists/model";

export function playbackBrowsePath(
  metadata: Plex.Metadata,
  playlist?: PlaylistPlaybackContext,
) {
  if (playlist) return playlistReturnPath(playlist);
  const mediaID =
    metadata.type === "episode"
      ? metadata.grandparentRatingKey
      : metadata.ratingKey;
  return `/browse/${metadata.librarySectionID}?${queryBuilder({ mid: mediaID })}`;
}

export function playbackAdvancePath(
  metadata: Plex.Metadata,
  playQueue: Plex.Metadata[] | null,
  restartNext = false,
  playlist?: PlaylistPlaybackContext,
) {
  const next =
    playlist || metadata.type === "episode" ? playQueue?.[1] : undefined;
  if (next && playlist)
    return playlistWatchPath(
      next,
      { ...playlist, index: playlist.index + 1 },
      restartNext,
    );
  if (next) return `/watch/${next.ratingKey}${restartNext ? "?t=0" : ""}`;
  return playbackBrowsePath(metadata, playlist);
}

export function activePlaybackMarker(
  metadata: Plex.Metadata | null,
  timeSeconds: number,
) {
  return metadata?.Marker?.find(
    (marker) =>
      marker.startTimeOffset / 1000 <= timeSeconds &&
      marker.endTimeOffset / 1000 >= timeSeconds,
  );
}
