import type { MediaMetadata } from "plex/media";
import {
  preparePlexPlayback,
  plexMediaURL,
  releasePlexSessions,
  pingPlexSession,
} from "shared/api/plexPlayback";
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
  if (plan.subtitle?.id !== undefined && plan.subtitles === "sidecar") {
    source.textTracks = [
      {
        url: plexMediaURL(`/library/streams/${plan.subtitle.id}`, {
          ...source.requestContext,
          encoding: "utf-8",
        }),
        language: plan.subtitle.languageCode || "und",
        label: plan.subtitle.displayTitle || plan.subtitle.language || "Subtitles",
      },
    ];
  }
  return { source, plan };
}

export async function releaseMediaPlayback(source: PlexPlaybackSource | null, keepalive = false) {
  if (!source) return;
  await releasePlexSessions(
    "video",
    source.requestContext,
    [source.id],
    keepalive,
  );
}

export async function pingMediaPlayback(source: PlexPlaybackSource) {
  await pingPlexSession("video", source);
}
