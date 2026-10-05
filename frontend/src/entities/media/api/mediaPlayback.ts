import { getXPlexProps, plexClient, PlexRequestError } from "features/session/model";
import { getBackendURL } from "shared/api/backend";
import { queryBuilder } from "shared/lib/query";
import { uuidV4 } from "shared/lib/identifiers";
import type { MediaVersion } from "../model/mediaVersions";
import { playbackProfile } from "../model/mediaPlayback";
import type {
  MediaPlaybackQuality,
  PlexPlaybackDecision,
  PlexPlaybackPlan,
  PlexPlaybackSource,
  PlexStreamPlan,
} from "../model/mediaPlayback";

function playbackRequestParams(
  metadata: Plex.Metadata,
  version: MediaVersion,
  plan: PlexPlaybackPlan,
  quality: MediaPlaybackQuality,
  sessionID: string,
  requestContext: Record<string, unknown> = getXPlexProps(),
) {
  return {
    ...requestContext,
    "X-Plex-Client-Profile-Name": "Generic",
    "X-Plex-Client-Profile-Extra":
      plan.kind === "plex"
        ? playbackProfile(plan)
        : "add-transcode-target(type=subtitleProfile&context=all&protocol=http&container=webvtt&subtitleCodec=webvtt&replace=true)",
    "X-Plex-Session-Identifier": sessionID,
    "X-Plex-Incomplete-Segments": 1,
    session: sessionID,
    path: `/library/metadata/${metadata.ratingKey}`,
    mediaIndex: version.mediaIndex,
    partIndex: version.partIndex,
    audioStreamID: version.part.Stream?.find((stream) => stream.streamType === 2 && stream.selected)
      ?.id,
    subtitleStreamID: plan.subtitle?.id ?? 0,
    protocol: plan.kind === "original" ? "http" : plan.protocol,
    directPlay: plan.kind === "original" ? 1 : 0,
    directStream: plan.kind === "original" || plan.copyVideo ? 1 : 0,
    directStreamAudio: plan.kind === "original" || plan.copyAudio ? 1 : 0,
    hasMDE: plan.kind === "original" ? 1 : 0,
    fastSeek: 1,
    audioBoost: 100,
    subtitleSize: 100,
    subtitles: plan.kind === "original" ? (plan.subtitle ? "sidecar" : "none") : plan.subtitles,
    autoAdjustQuality: 0,
    ...(quality.bitrate && quality.bitrate > 0 ? { maxVideoBitrate: quality.bitrate } : {}),
  };
}

function proxyMediaURL(path: string, params: Record<string, unknown>) {
  const parsed = new URL(path, "http://plex.local");
  return `${getBackendURL()}/dynproxy${parsed.pathname}?${queryBuilder({ ...Object.fromEntries(parsed.searchParams), ...params })}`;
}

export function createMediaPlaybackSource(
  metadata: Plex.Metadata,
  version: MediaVersion,
  quality: MediaPlaybackQuality,
  plan: PlexPlaybackPlan,
  requestContext: Record<string, unknown> = getXPlexProps(),
): PlexPlaybackSource {
  if (!version?.part.key) throw new Error("No playable media file is available.");
  const sessionID = uuidV4();
  const params = playbackRequestParams(metadata, version, plan, quality, sessionID, requestContext);
  const source: PlexPlaybackSource = {
    id: sessionID,
    requestContext,
    type: plan.kind === "original" ? "file" : plan.protocol,
    url:
      plan.kind === "original"
        ? proxyMediaURL(version.part.key, {
            ...requestContext,
            "X-Plex-Session-Identifier": sessionID,
            session: sessionID,
          })
        : proxyMediaURL(
            `/video/:/transcode/universal/start.${plan.protocol === "hls" ? "m3u8" : "mpd"}`,
            params,
          ),
    sessionID: plan.kind === "original" ? undefined : sessionID,
  };
  if (plan.subtitle && (plan.kind === "original" || plan.subtitles === "sidecar")) {
    source.subtitleSessionID = uuidV4();
    source.loadTextTracks = (signal) => loadSubtitleTracks(metadata, version, plan, source, signal);
  }
  return source;
}

async function loadSubtitleTracks(
  metadata: Plex.Metadata,
  version: MediaVersion,
  plan: PlexPlaybackPlan,
  source: PlexPlaybackSource,
  signal: AbortSignal,
): ReturnType<NonNullable<PlexPlaybackSource["loadTextTracks"]>> {
  if (!source.subtitleSessionID || !plan.subtitle) return { tracks: [] };
  const params = playbackRequestParams(
    metadata,
    version,
    { kind: "original", subtitle: plan.subtitle },
    {},
    source.subtitleSessionID,
    source.requestContext,
  );
  // PMS requires read authorization for subtitle extraction. This runs after
  // video readiness, independently of the video's fallback decision.
  try {
    await plexClient.get(
      `/subtitles/:/transcode/universal/decision?${queryBuilder(params)}`,
      signal,
    );
  } catch (reason) {
    return {
      error: {
        kind: reason instanceof PlexRequestError ? "network" : "subtitle",
        httpStatus: reason instanceof PlexRequestError ? reason.status : undefined,
        message: "The selected subtitles could not be loaded.",
      },
    };
  }
  return {
    tracks: [
      {
        url: proxyMediaURL("/subtitles/:/transcode/universal/start", {
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

export async function getMediaPlaybackDecision(
  metadata: Plex.Metadata,
  version: MediaVersion,
  quality: MediaPlaybackQuality,
  plan: PlexStreamPlan,
  requestContext: Record<string, unknown>,
  signal: AbortSignal,
) {
  const sessionID = uuidV4();
  try {
    return await plexClient.get<PlexPlaybackDecision>(
      `/video/:/transcode/universal/decision?${queryBuilder(
        playbackRequestParams(metadata, version, plan, quality, sessionID, requestContext),
      )}`,
      signal,
    );
  } finally {
    void stopSessions(requestContext, [sessionID]);
  }
}

function sessionURL(
  requestContext: Record<string, unknown>,
  sessionID: string,
  action: "stop" | "ping",
) {
  return proxyMediaURL(`/video/:/transcode/universal/${action}`, {
    ...requestContext,
    "X-Plex-Session-Identifier": sessionID,
    session: sessionID,
  });
}

export async function releaseMediaPlayback(source: PlexPlaybackSource | null, keepalive = false) {
  if (!source) return;
  await stopSessions(
    source.requestContext,
    [source.sessionID, source.subtitleSessionID].filter((id): id is string => Boolean(id)),
    keepalive,
  );
}

async function stopSessions(
  requestContext: Record<string, unknown>,
  sessions: string[],
  keepalive = false,
) {
  await Promise.all(
    sessions.map(async (sessionID) => {
      try {
        await fetch(sessionURL(requestContext, sessionID, "stop"), { keepalive });
      } catch {
        // Plex also expires sessions when a disconnected client cannot send stop.
      }
    }),
  );
}

export async function pingMediaPlayback(source: PlexPlaybackSource) {
  if (source.sessionID) {
    const response = await fetch(sessionURL(source.requestContext, source.sessionID, "ping"));
    if (!response.ok) throw new Error("Plex could not keep the playback session alive.");
  }
}
