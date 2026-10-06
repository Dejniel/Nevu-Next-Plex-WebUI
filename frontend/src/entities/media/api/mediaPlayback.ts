import { PlexClient, PlexRequestError } from "shared/api/PlexClient";
import { getBackendURL } from "shared/api/backend";
import { queryBuilder } from "shared/lib/query";
import { uuidV4 } from "shared/lib/identifiers";
import type { MediaVersion } from "../model/mediaVersions";
import { playbackProfile, playbackDecisionPlan } from "../model/mediaPlayback";
import type {
  MediaPlaybackQuality,
  PlexPlaybackDecision,
  PlexPlaybackPlan,
  PlexPlaybackSource,
  MediaPlaybackRequest,
} from "../model/mediaPlayback";

const DASH_SEGMENT_SECONDS = 8;

function playbackRequestParams(
  metadata: Plex.Metadata,
  version: MediaVersion,
  request: MediaPlaybackRequest,
  quality: MediaPlaybackQuality,
  sessionID: string,
  requestContext: Record<string, unknown>,
) {
  const { original, stream } = request;
  const subtitle = stream?.subtitle ?? original?.subtitle;
  return {
    ...requestContext,
    "X-Plex-Client-Profile-Name": "Generic",
    "X-Plex-Client-Profile-Extra": playbackProfile(request),
    "X-Plex-Session-Identifier": sessionID,
    "X-Plex-Incomplete-Segments": 1,
    session: sessionID,
    path: `/library/metadata/${metadata.ratingKey}`,
    mediaIndex: version.mediaIndex,
    partIndex: version.partIndex,
    audioStreamID: version.part.Stream?.find((stream) => stream.streamType === 2 && stream.selected)
      ?.id,
    subtitleStreamID: subtitle?.id ?? 0,
    protocol: stream?.protocol ?? "http",
    ...(stream?.protocol === "dash" ? { secondsPerSegment: DASH_SEGMENT_SECONDS } : {}),
    directPlay: original ? 1 : 0,
    directStream: stream?.copyVideo ? 1 : 0,
    directStreamAudio: stream?.copyAudio ? 1 : 0,
    // Native compatibility has been checked for this exact media/part selection.
    hasMDE: original ? 1 : 0,
    fastSeek: 0,
    audioBoost: 100,
    subtitleSize: 100,
    subtitles: stream?.subtitles ?? (subtitle ? "sidecar" : "none"),
    autoAdjustQuality: 0,
    ...(quality.bitrate && quality.bitrate > 0 ? { maxVideoBitrate: quality.bitrate } : {}),
  };
}

function playbackClient(context: Record<string, unknown>) {
  return new PlexClient(() => String(context["X-Plex-Token"] ?? ""));
}

function proxyMediaURL(path: string, params: Record<string, unknown>) {
  const parsed = new URL(path, "http://plex.local");
  return `${getBackendURL()}/dynproxy${parsed.pathname}?${queryBuilder({ ...Object.fromEntries(parsed.searchParams), ...params })}`;
}

export async function prepareMediaPlayback(
  metadata: Plex.Metadata,
  version: MediaVersion,
  quality: MediaPlaybackQuality,
  request: MediaPlaybackRequest,
  requestContext: Record<string, unknown>,
  signal: AbortSignal,
): Promise<{ source: PlexPlaybackSource; plan: PlexPlaybackPlan }> {
  if (!version?.part.key) throw new Error("No playable media file is available.");
  signal.throwIfAborted();
  const sessionID = uuidV4();
  const params = playbackRequestParams(
    metadata,
    version,
    request,
    quality,
    sessionID,
    requestContext,
  );
  try {
    const decision = await playbackClient(requestContext).get<PlexPlaybackDecision>(
      `/video/:/transcode/universal/decision?${queryBuilder(params)}`,
      signal,
    );
    signal.throwIfAborted();
    const plan = playbackDecisionPlan(decision, request);
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
      stripSegmentInitialization: plan.kind === "plex" && plan.protocol === "dash",
      // Copied fragments can begin between keyframes. Fetch preceding media on
      // a seek so the decoder can reach the requested position without a gap jump.
      seekPreRoll:
        plan.kind === "plex" && plan.protocol === "dash" && plan.copyVideo
          ? 2 * DASH_SEGMENT_SECONDS
          : undefined,
    };
    if (plan.subtitle && (plan.kind === "original" || plan.subtitles === "sidecar")) {
      source.subtitleSessionID = uuidV4();
      source.loadTextTracks = (signal) =>
        loadSubtitleTracks(metadata, version, plan, source, signal);
    }
    return { source, plan };
  } catch (reason) {
    await stopSessions(requestContext, [sessionID]);
    throw reason;
  }
}

async function loadSubtitleTracks(
  metadata: Plex.Metadata,
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
    [source.id, source.subtitleSessionID].filter((id): id is string => Boolean(id)),
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
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      try {
        await fetch(sessionURL(requestContext, sessionID, "stop"), {
          keepalive,
          signal: controller.signal,
        });
      } catch {
        // Plex also expires sessions when a disconnected client cannot send stop.
      } finally {
        clearTimeout(timeout);
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
