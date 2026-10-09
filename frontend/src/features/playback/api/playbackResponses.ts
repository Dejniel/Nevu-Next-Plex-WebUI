import { readPlaybackQueueItem } from "entities/media/model";
import {
  plexArray,
  plexContainer,
  PlexResponseError,
} from "shared/api/plexResponse";

export interface PlaybackTimelineResult {
  terminationCode?: number;
  terminationText?: string;
}

export function readPlaybackQueue(response: unknown) {
  const container = plexContainer(response, "playback queue");
  const items = plexArray(container.Metadata, "playback queue").map(
    readPlaybackQueueItem,
  );
  if (
    container.size !== undefined &&
    (!Number.isSafeInteger(container.size) || container.size !== items.length)
  )
    throw new PlexResponseError("playback queue");
  return items;
}

export function readPlaybackTimeline(
  response: unknown,
): PlaybackTimelineResult {
  // PMS may acknowledge a report with an empty successful body.
  if (response === "" || response === undefined || response === null) return {};
  const container = plexContainer(response, "playback timeline");
  const { terminationCode, terminationText } = container;
  if (
    (terminationCode !== undefined && !Number.isSafeInteger(terminationCode)) ||
    (terminationText !== undefined && typeof terminationText !== "string")
  )
    throw new PlexResponseError("playback timeline");
  return {
    ...(terminationCode !== undefined && {
      terminationCode: terminationCode as number,
    }),
    ...(terminationText !== undefined && { terminationText }),
  };
}
