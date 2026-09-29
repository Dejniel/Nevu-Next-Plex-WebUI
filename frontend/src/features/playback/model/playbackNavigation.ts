import { queryBuilder } from "plex/QuickFunctions";

export function playbackBrowsePath(metadata: Plex.Metadata) {
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
) {
  const next = metadata.type === "episode" ? playQueue?.[1] : undefined;
  if (next)
    return `/watch/${next.ratingKey}${restartNext ? "?t=0" : ""}`;
  return playbackBrowsePath(metadata);
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
