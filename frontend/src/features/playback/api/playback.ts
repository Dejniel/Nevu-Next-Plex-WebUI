import {
  plexClient,
  getXPlexProps,
  useServerSession,
} from "features/session/model";
import { getIncludeProps, type PlexPlaybackSource } from "entities/media/model";
import { PlexClient } from "shared/api/PlexClient";
import { queryBuilder } from "shared/lib/query";
import {
  readPlaybackQueue,
  readPlaybackTimeline,
  type PlaybackTimelineResult,
} from "./playbackResponses";

export type PlaybackTimelineState =
  | "buffering"
  | "playing"
  | "paused"
  | "stopped";

async function putStream(
  field: "audioStreamID" | "subtitleStreamID",
  partID: number | undefined,
  streamID: number | undefined,
  signal?: AbortSignal,
) {
  if (
    partID === undefined ||
    streamID === undefined ||
    !Number.isSafeInteger(partID) ||
    partID <= 0 ||
    !Number.isSafeInteger(streamID) ||
    streamID < 0
  )
    throw new Error(
      "This track cannot be selected because Plex did not identify its file and stream.",
    );
  await plexClient.put(
    `/library/parts/${partID}?${queryBuilder({
      [field]: streamID,
      ...getXPlexProps(),
    })}`,
    {},
    signal,
  );
}

export const putAudioStream = (
  partID: number | undefined,
  streamID: number | undefined,
  signal?: AbortSignal,
) => putStream("audioStreamID", partID, streamID, signal);
export const putSubtitleStream = (
  partID: number | undefined,
  streamID: number | undefined,
  signal?: AbortSignal,
) => putStream("subtitleStreamID", partID, streamID, signal);

export async function getTimelineUpdate(
  key: number,
  duration: number,
  state: PlaybackTimelineState,
  time: number,
  source: PlexPlaybackSource,
): Promise<PlaybackTimelineResult> {
  const context = source.requestContext;
  const client = new PlexClient(() => String(context["X-Plex-Token"] ?? ""));
  const response = await client.get(
    `/:/timeline?${queryBuilder({
      ...context,
      ratingKey: key,
      key: `/library/metadata/${key}/`,
      duration,
      state,
      playbackTime: time,
      time,
      context: "library",
      "X-Plex-Session-Identifier": source.id,
    })}`,
  );
  return readPlaybackTimeline(response);
}

export async function getPlaybackQueueForItem(
  ratingKey: string,
  signal?: AbortSignal,
) {
  const serverID = useServerSession.getState().server?.machineIdentifier;
  if (!serverID)
    throw new Error("The active Plex server is unavailable. Please try again.");
  const response = await plexClient.post(
    `/playQueues?${queryBuilder({
      type: "video",
      uri: `server://${serverID}/com.plexapp.plugins.library/library/metadata/${encodeURIComponent(ratingKey)}`,
      continuous: 1,
      ...getIncludeProps(),
      ...getXPlexProps(),
    })}`,
    undefined,
    signal,
  );
  return readPlaybackQueue(response);
}
