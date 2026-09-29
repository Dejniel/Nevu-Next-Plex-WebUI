import { platformCache } from "shared/lib/platform";
import {
  authedGet,
  authedPost,
  authedPut,
  getXPlexProps,
} from "features/session/model";
import { getIncludeProps } from "entities/media/model";
import { queryBuilder } from "shared/lib/query";

export interface StreamLimitations {
  autoAdjustQuality?: boolean;
  maxVideoBitrate?: number;
  mediaIndex?: number;
  partIndex?: number;
}

export function getStreamProps(key: string, limitation: StreamLimitations) {
  return {
    audioBoost: 700,
    autoAdjustQuality: limitation.autoAdjustQuality ? 1 : 0,
    autoAdjustSubtitle: 0,
    directPlay: limitation.maxVideoBitrate === -1 ? 1 : 0,
    directStream: 1,
    directStreamAudio: 1,
    fastSeek: 1,
    hasMDE: 1,
    location: "lan",
    mediaBufferSize: 102400,
    mediaIndex: limitation.mediaIndex ?? 0,
    partIndex: limitation.partIndex ?? 0,
    path: `/library/metadata/${key}`,
    protocol: platformCache.isDesktop ? "hls" : "dash",
    addDebugOverlay: 0,
    subtitleSize: 100,
    subtitles: limitation.maxVideoBitrate === -1 ? "sidecar" : "burn",
    "Accept-Language": "en",
    ...getXPlexProps(),
    ...(limitation.autoAdjustQuality && { autoAdjustQuality: 1 }),
    ...(limitation.maxVideoBitrate && limitation.maxVideoBitrate !== -1 && {
      maxVideoBitrate: limitation.maxVideoBitrate,
    }),
  };
}

export async function getUniversalDecision(
  id: string,
  limitation: StreamLimitations,
) {
  await authedGet(
    `/video/:/transcode/universal/decision?${queryBuilder({
      ...getStreamProps(id, limitation),
    })}`,
  );
}

export async function sendUniversalPing() {
  await authedGet(
    `/video/:/transcode/universal/ping?${queryBuilder(getXPlexProps())}`,
  );
}

export async function putAudioStream(partID: number, streamID: number) {
  await authedPut(
    `/library/parts/${partID}?${queryBuilder({
      audioStreamID: streamID,
      ...getXPlexProps(),
    })}`,
    {},
  );
}

export async function putSubtitleStream(partID: number, streamID: number) {
  await authedPut(
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
