import { getXPlexProps, plexClient } from "features/session/model";
import { getBackendURL } from "shared/api/backend";
import { queryBuilder } from "shared/lib/query";
import { uuidV4 } from "shared/lib/identifiers";
import { getMediaVersions } from "../model/mediaVersions";
import type { MediaVersion } from "../model/mediaVersions";
import {
  mediaContainerMime,
  planMediaPlayback,
  playbackDecisionMode,
} from "../model/mediaPlayback";
import type {
  MediaPlaybackQuality,
  PlexPlaybackDecision,
  PlexPlaybackPlan,
  PlexPlaybackSource,
} from "../model/mediaPlayback";

export function playbackRequestParams(
  metadata: Plex.Metadata,
  version: MediaVersion,
  plan: PlexPlaybackPlan,
  quality: MediaPlaybackQuality,
  sessionID: string,
  requestContext = getXPlexProps(),
) {
  return {
    ...requestContext,
    "X-Plex-Client-Profile-Name": "Generic",
    "X-Plex-Client-Profile-Extra": plan.profile,
    "X-Plex-Session-Identifier": sessionID,
    "X-Plex-Incomplete-Segments": 1,
    session: sessionID,
    path: `/library/metadata/${metadata.ratingKey}`,
    mediaIndex: version.mediaIndex,
    partIndex: version.partIndex,
    protocol: plan.protocol,
    directPlay: plan.directPlay ? 1 : 0,
    directStream: plan.copyVideo ? 1 : 0,
    directStreamAudio: plan.copyAudio ? 1 : 0,
    hasMDE: 0,
    fastSeek: 1,
    audioBoost: 100,
    subtitleSize: 100,
    subtitles: plan.subtitles,
    autoAdjustQuality: 0,
    ...(quality.bitrate && quality.bitrate > 0
      ? { maxVideoBitrate: quality.bitrate }
      : {}),
  };
}

export function proxyMediaURL(
  path: string,
  params: Record<string, unknown> = {},
) {
  const parsed = new URL(path, "http://plex.local");
  return `${getBackendURL()}/dynproxy${parsed.pathname}?${queryBuilder({ ...getXPlexProps(), ...Object.fromEntries(parsed.searchParams), ...params })}`;
}

export async function resolveMediaPlayback(
  metadata: Plex.Metadata,
  quality: MediaPlaybackQuality = {},
  version = getMediaVersions(metadata)[0],
  compatibility = false,
): Promise<PlexPlaybackSource> {
  if (!version?.part.key)
    throw new Error("No playable media file is available.");
  const plan = await planMediaPlayback(version, quality, compatibility);
  const sessionID = uuidV4();
  const requestContext = getXPlexProps();
  const params = playbackRequestParams(
    metadata,
    version,
    plan,
    quality,
    sessionID,
    requestContext,
  );
  const decision = await plexClient.get<PlexPlaybackDecision>(
    `/video/:/transcode/universal/decision?${queryBuilder(params)}`,
  );
  const mode = playbackDecisionMode(decision, plan);
  const extension = plan.protocol === "hls" ? "m3u8" : "mpd";
  const source: PlexPlaybackSource = {
    id: sessionID,
    requestContext,
    mode,
    reason:
      mode === "directplay"
        ? undefined
        : decision.MediaContainer.directPlayDecisionText,
    type: mode === "directplay" ? "file" : plan.protocol,
    url:
      mode === "directplay"
        ? proxyMediaURL(version.part.key, {
            ...requestContext,
            "X-Plex-Session-Identifier": sessionID,
            session: sessionID,
          })
        : proxyMediaURL(
            `/video/:/transcode/universal/start.${extension}`,
            params,
          ),
    mimeType:
      mode === "directplay"
        ? (mediaContainerMime(
            version.part.container ?? version.media.container,
          ) ?? undefined)
        : undefined,
    sessionID: mode === "directplay" ? undefined : sessionID,
  };
  if (plan.subtitles === "sidecar" && plan.subtitle) {
    const subtitleSessionID = uuidV4();
    const subtitleParams = {
      ...playbackRequestParams(
        metadata,
        version,
        plan,
        {},
        subtitleSessionID,
        requestContext,
      ),
      directPlay: 1,
      hasMDE: 1,
    };
    // This decision authorizes reading the original for subtitle extraction;
    // browser video capabilities and bitrate limits do not apply to that read.
    await plexClient.get(
      `/video/:/transcode/universal/decision?${queryBuilder(subtitleParams)}`,
    );
    source.subtitleSessionID = subtitleSessionID;
    source.textTracks = [
      {
        url: proxyMediaURL("/subtitles/:/transcode/universal/start", {
          ...subtitleParams,
          protocol: "http",
          directPlay: 0,
          directStream: 1,
          subtitleStreamID: plan.subtitle.id,
          format: "webvtt",
          subtitleCodec: "webvtt",
        }),
        language: plan.subtitle.languageCode || "und",
        label:
          plan.subtitle.displayTitle || plan.subtitle.language || "Subtitles",
      },
    ];
  }
  return source;
}

function sessionURL(
  source: PlexPlaybackSource,
  sessionID: string,
  action: "stop" | "ping",
) {
  return proxyMediaURL(`/video/:/transcode/universal/${action}`, {
    ...(source.requestContext ?? getXPlexProps()),
    "X-Plex-Session-Identifier": sessionID,
    session: sessionID,
  });
}

export async function releaseMediaPlayback(
  source: PlexPlaybackSource | null,
  keepalive = false,
) {
  if (!source) return;
  await Promise.all(
    [source.sessionID, source.subtitleSessionID]
      .filter(Boolean)
      .map(async (sessionID) => {
        try {
          await fetch(sessionURL(source, sessionID!, "stop"), { keepalive });
        } catch {
          // Plex also expires sessions when a disconnected client cannot send stop.
        }
      }),
  );
}

export async function pingMediaPlayback(source: PlexPlaybackSource) {
  if (source.sessionID) {
    const response = await fetch(sessionURL(source, source.sessionID, "ping"));
    if (!response.ok)
      throw new Error("Plex could not keep the playback session alive.");
  }
}
