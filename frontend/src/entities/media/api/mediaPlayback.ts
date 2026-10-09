import type { MediaMetadata } from "plex/media";
import { PlexClient, PlexRequestError } from "shared/api/PlexClient";
import {
  preparePlexPlayback,
  plexMediaURL,
  releasePlexSessions,
  pingPlexSession,
} from "shared/api/plexPlayback";
import { queryBuilder } from "shared/lib/query";
import { uuidV4 } from "shared/lib/identifiers";
import type { MediaVersion } from "../model/mediaVersions";
import { playbackProfile, playbackDecisionPlan } from "../model/mediaPlayback";
import type {
  MediaPlaybackQuality,
  PlexPlaybackPlan,
  PlexPlaybackSource,
} from "../model/mediaPlayback";

const DASH_SEGMENT_SECONDS = 8;

function playbackRequestParams(
  metadata: MediaMetadata,
  version: MediaVersion,
  plan: PlexPlaybackPlan,
  quality: MediaPlaybackQuality,
) {
  return {
    "X-Plex-Client-Profile-Name": "Generic",
    "X-Plex-Client-Profile-Extra": playbackProfile(plan),
    path: `/library/metadata/${metadata.ratingKey}`,
    mediaIndex: version.mediaIndex,
    partIndex: version.partIndex,
    audioStreamID: version.part.Stream?.find((stream) => stream.streamType === 2 && stream.selected)
      ?.id,
    subtitleStreamID: plan.subtitle?.id ?? 0,
    protocol: plan.protocol,
    ...(plan.protocol === "dash" ? { secondsPerSegment: DASH_SEGMENT_SECONDS } : {}),
    directPlay: 0,
    directStream: plan.copyVideo ? 1 : 0,
    directStreamAudio: plan.copyAudio ? 1 : 0,
    hasMDE: 0,
    fastSeek: 0,
    audioBoost: 100,
    subtitleSize: 100,
    subtitles: plan.subtitles,
    autoAdjustQuality: 0,
    ...(quality.bitrate && quality.bitrate > 0 ? { maxVideoBitrate: quality.bitrate } : {}),
  };
}

function playbackClient(context: Record<string, unknown>) {
  return new PlexClient(() => String(context["X-Plex-Token"] ?? ""));
}

export async function prepareMediaPlayback(
  metadata: MediaMetadata,
  version: MediaVersion,
  quality: MediaPlaybackQuality,
  requestedPlan: PlexPlaybackPlan,
  requestContext: Record<string, unknown>,
  signal: AbortSignal,
): Promise<{ source: PlexPlaybackSource; plan: PlexPlaybackPlan }> {
  if (!version?.part.key) throw new Error("No playable media file is available.");
  const prepared = await preparePlexPlayback(
    "video",
    playbackRequestParams(metadata, version, requestedPlan, quality),
    requestContext,
    signal,
    (decision) => playbackDecisionPlan(decision, requestedPlan),
  );
  const { plan } = prepared;
  const source: PlexPlaybackSource = {
    ...prepared.source,
    // Copied fragments can begin between keyframes. Read preceding media on seek.
    seekPreRoll: plan.protocol === "dash" && plan.copyVideo ? 2 * DASH_SEGMENT_SECONDS : undefined,
  };
  if (plan.subtitle && plan.subtitles === "sidecar") {
    source.subtitleSessionID = uuidV4();
    source.loadTextTracks = (signal) => loadSubtitleTracks(metadata, version, plan, source, signal);
  }
  return { source, plan };
}

async function loadSubtitleTracks(
  metadata: MediaMetadata,
  version: MediaVersion,
  plan: PlexPlaybackPlan,
  source: PlexPlaybackSource,
  signal: AbortSignal,
): ReturnType<NonNullable<PlexPlaybackSource["loadTextTracks"]>> {
  if (!source.subtitleSessionID || !plan.subtitle) return { tracks: [] };
  const params = {
    ...source.requestContext,
    "X-Plex-Session-Identifier": source.subtitleSessionID,
    session: source.subtitleSessionID,
    path: `/library/metadata/${metadata.ratingKey}`,
    mediaIndex: version.mediaIndex,
    partIndex: version.partIndex,
    subtitleStreamID: plan.subtitle.id,
    "X-Plex-Client-Profile-Name": "Generic",
    "X-Plex-Client-Profile-Extra":
      "add-transcode-target(type=subtitleProfile&context=all&protocol=http&container=webvtt&subtitleCodec=webvtt&replace=true)",
    protocol: "http",
    hasMDE: 1,
    directPlay: 1,
  };
  // PMS requires read authorization for subtitle extraction. This runs after
  // video readiness, independently of the video's fallback decision.
  try {
    await playbackClient(source.requestContext).get(
      `/subtitles/:/transcode/universal/decision?${queryBuilder(params)}`,
      signal,
    );
  } catch (reason) {
    return {
      error: {
        kind: "subtitle",
        httpStatus: reason instanceof PlexRequestError ? reason.status : undefined,
        message: "The selected subtitles could not be loaded.",
      },
    };
  }
  return {
    tracks: [
      {
        url: plexMediaURL("/subtitles/:/transcode/universal/start", {
          ...params,
          directPlay: 0,
          format: "webvtt",
          subtitleCodec: "webvtt",
        }),
        language: plan.subtitle.languageCode || "und",
        label: plan.subtitle.displayTitle || plan.subtitle.language || "Subtitles",
      },
    ],
  };
}

export async function releaseMediaPlayback(source: PlexPlaybackSource | null, keepalive = false) {
  if (!source) return;
  await releasePlexSessions(
    "video",
    source.requestContext,
    [source.id, source.subtitleSessionID].filter((id): id is string => Boolean(id)),
    keepalive,
  );
}

export async function pingMediaPlayback(source: PlexPlaybackSource) {
  await pingPlexSession("video", source);
}
