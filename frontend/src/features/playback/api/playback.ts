import { plexClient, getXPlexProps, useServerSession } from "features/session/model";
import { getIncludeProps, type PlexPlaybackSource } from "entities/media/model";
import { PlexClient } from "shared/api/PlexClient";
import { queryBuilder } from "shared/lib/query";

export type PlaybackTimelineState = "buffering" | "playing" | "paused" | "stopped";

export interface PlaybackTimelineResult {
  terminationCode?: number;
  terminationText?: string;
}

interface PlaybackQueueResponse {
  MediaContainer?: { Metadata?: Plex.Metadata[] };
}

export async function putAudioStream(partID: number, streamID: number, signal?: AbortSignal) {
  await plexClient.put(
    `/library/parts/${partID}?${queryBuilder({
      audioStreamID: streamID,
      ...getXPlexProps(),
    })}`,
    {},
    signal,
  );
}

export async function putSubtitleStream(partID: number, streamID: number, signal?: AbortSignal) {
  await plexClient.put(
    `/library/parts/${partID}?${queryBuilder({
      subtitleStreamID: streamID,
      ...getXPlexProps(),
    })}`,
    {},
    signal,
  );
}

export async function getTimelineUpdate(
  key: number,
  duration: number,
  state: PlaybackTimelineState,
  time: number,
  source: PlexPlaybackSource,
): Promise<PlaybackTimelineResult> {
  const context = source.requestContext;
  const client = new PlexClient(() => String(context["X-Plex-Token"] ?? ""));
  const response = await client.get<{ MediaContainer?: PlaybackTimelineResult }>(
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
  // PMS may acknowledge a report with an empty successful response.
  return response?.MediaContainer ?? {};
}

export async function getPlaybackQueueForItem(
  ratingKey: string,
  signal?: AbortSignal,
): Promise<Plex.Metadata[]> {
  const serverID = useServerSession.getState().server?.machineIdentifier;
  if (!serverID) throw new Error("The active Plex server is unavailable. Please try again.");
  const response = await plexClient.post<PlaybackQueueResponse>(
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
  const container = response?.MediaContainer;
  if (
    !container || typeof container !== "object" || Array.isArray(container) ||
    (container.Metadata !== undefined && !Array.isArray(container.Metadata))
  )
    throw new Error("Plex returned an invalid playback queue.");
  return container.Metadata ?? [];
}
