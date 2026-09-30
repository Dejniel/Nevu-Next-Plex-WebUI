import {
  authedGet,
  authedPost,
  plexClient,
  getXPlexProps,
} from "features/session/model";
import { getIncludeProps } from "entities/media/model";
import { queryBuilder } from "shared/lib/query";

export async function putAudioStream(partID: number, streamID: number) {
  await plexClient.put(
    `/library/parts/${partID}?${queryBuilder({
      audioStreamID: streamID,
      ...getXPlexProps(),
    })}`,
    {},
  );
}

export async function putSubtitleStream(partID: number, streamID: number) {
  await plexClient.put(
    `/library/parts/${partID}?${queryBuilder({
      subtitleStreamID: streamID,
      ...getXPlexProps(),
    })}`,
    {},
  );
}

export async function getTimelineUpdate(
  key: number,
  duration: number,
  state: string,
  time: number,
  sessionID?: string,
): Promise<Plex.TimelineUpdateResult> {
  return authedGet(
    `/:/timeline?${queryBuilder({
      ratingKey: key,
      key: `/library/metadata/${key}/`,
      duration,
      state,
      playbackTime: time,
      time,
      context: "library",
      ...getXPlexProps(),
      ...(sessionID ? { "X-Plex-Session-Identifier": sessionID } : {}),
    })}`,
  );
}

export async function getServerPreferences(): Promise<Plex.ServerPreferences> {
  const response = await authedGet("/");
  return response.MediaContainer;
}

export async function getPlayQueue(uri: string): Promise<Plex.Metadata[]> {
  const response = await authedPost(
    `/playQueues?${queryBuilder({
      type: "video",
      uri,
      continuous: 1,
      ...getIncludeProps(),
      ...getXPlexProps(),
    })}`,
  );
  return response.MediaContainer.Metadata;
}

export async function getPlaybackMetadata(
  itemID: string,
): Promise<Plex.Metadata | null> {
  const response = await authedGet(
    `/library/metadata/${itemID}?${queryBuilder({
      ...getIncludeProps(),
      ...getXPlexProps(),
    })}`,
  );
  return response?.MediaContainer?.Metadata?.[0] ?? null;
}

export async function getPlaybackQueueForItem(
  metadata: Plex.Metadata,
): Promise<Plex.Metadata[]> {
  const preferences = await getServerPreferences();
  return getPlayQueue(
    `server://${preferences.machineIdentifier}` +
      `/com.plexapp.plugins.library/library/metadata/${metadata.ratingKey}`,
  );
}
