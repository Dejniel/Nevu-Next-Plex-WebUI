import { PlexClient } from "./PlexClient";
import { getBackendURL } from "./backend";
import { queryBuilder } from "shared/lib/query";
import { uuidV4 } from "shared/lib/identifiers";
import type { VideoSource } from "shared/lib/video/types";

type PlaybackEndpoint = "audio" | "video";
type StreamingProtocol = "hls" | "dash";

export interface PlexStreamSource extends VideoSource {
  type: StreamingProtocol;
  requestContext: Record<string, unknown>;
}

export interface PlexPlaybackDecision {
  MediaContainer: {
    generalDecisionCode?: number;
    generalDecisionText?: string;
    directPlayDecisionCode?: number;
    directPlayDecisionText?: string;
    transcodeDecisionCode?: number;
    transcodeDecisionText?: string;
    mdeDecisionCode?: number;
    mdeDecisionText?: string;
    Metadata?: Array<{
      Media?: Array<{
        selected?: boolean;
        protocol?: string;
        Part?: Array<{
          selected?: boolean;
          decision?: string;
          Stream?: Array<{
            streamType: number;
            decision?: string;
            selected?: boolean;
            key?: string;
            codec?: string;
          }>;
        }>;
      }>;
    }>;
  };
}

export class PlexPlaybackRefusal extends Error {
  constructor(message: string, readonly conversionDenied: boolean) {
    super(message);
    this.name = "PlexPlaybackRefusal";
  }
}

export function playbackDecisionStreams(
  decision: PlexPlaybackDecision,
  protocol: StreamingProtocol,
) {
  const container = decision?.MediaContainer;
  const code = container?.generalDecisionCode ?? container?.mdeDecisionCode;
  if (!code || !Number.isFinite(code) || code < 1000)
    throw new Error("Plex did not return a playback decision.");
  if (code >= 2000)
    throw new PlexPlaybackRefusal(
      [
        container.generalDecisionText ?? container.mdeDecisionText,
        (container.transcodeDecisionCode ?? 0) >= 2000 ? container.transcodeDecisionText : undefined,
      ]
        .filter((text, index, values) => text && values.indexOf(text) === index)
        .join(" ") || "Plex could not prepare this media for playback.",
      (container.transcodeDecisionCode ?? 0) >= 2000,
    );
  const versions = container.Metadata?.[0]?.Media ?? [];
  const media = versions.find((media) => media.selected) ?? versions[0];
  const part = media?.Part?.find((part) => part.selected) ?? media?.Part?.[0];
  if (part?.decision === "directplay" || code === 1000)
    throw new Error("Plex did not prepare the requested segmented stream.");
  if (media?.protocol && media.protocol !== protocol)
    throw new Error("Plex selected an unsupported streaming format.");
  return part?.Stream ?? [];
}

export function plexMediaURL(path: string, params: Record<string, unknown>) {
  const parsed = new URL(path, "http://plex.local");
  return `${getBackendURL()}/dynproxy${parsed.pathname}?${queryBuilder({ ...Object.fromEntries(parsed.searchParams), ...params })}`;
}

/** Decision, validation and start own one immutable session and parameter set. */
export async function preparePlexPlayback<Plan extends { protocol: StreamingProtocol }>(
  endpoint: PlaybackEndpoint,
  params: Record<string, unknown> & { protocol: StreamingProtocol },
  context: Record<string, unknown>,
  signal: AbortSignal,
  readDecision: (decision: PlexPlaybackDecision) => Plan,
): Promise<{ source: PlexStreamSource; plan: Plan }> {
  signal.throwIfAborted();
  const id = uuidV4();
  const requestContext = { ...context };
  const query = queryBuilder({
    ...requestContext,
    ...params,
    "X-Plex-Session-Identifier": id,
    "X-Plex-Incomplete-Segments": 1,
    session: id,
  });
  const path = `/${endpoint}/:/transcode/universal`;
  try {
    const client = new PlexClient(() => String(requestContext["X-Plex-Token"] ?? ""));
    const decision = await client.get<PlexPlaybackDecision>(`${path}/decision?${query}`, signal);
    signal.throwIfAborted();
    const plan = readDecision(decision);
    if (plan.protocol !== params.protocol)
      throw new Error("Plex selected an unsupported streaming format.");
    return {
      plan,
      source: {
        id,
        requestContext,
        type: plan.protocol,
        url: `${getBackendURL()}/dynproxy${path}/start.${plan.protocol === "hls" ? "m3u8" : "mpd"}?${query}`,
        stripSegmentInitialization: plan.protocol === "dash",
      },
    };
  } catch (reason) {
    await releasePlexSessions(endpoint, requestContext, [id]);
    throw reason;
  }
}

function sessionURL(
  endpoint: PlaybackEndpoint,
  context: Record<string, unknown>,
  id: string,
  action: "stop" | "ping",
) {
  return plexMediaURL(`/${endpoint}/:/transcode/universal/${action}`, {
    ...context,
    "X-Plex-Session-Identifier": id,
    session: id,
  });
}

export async function releasePlexSessions(
  endpoint: PlaybackEndpoint,
  context: Record<string, unknown>,
  ids: string[],
  keepalive = false,
) {
  await Promise.all(
    ids.map(async (id) => {
      try {
        await fetch(sessionURL(endpoint, context, id, "stop"), {
          keepalive,
          signal: AbortSignal.timeout(3000),
        });
      } catch {
        // PMS also expires disconnected sessions if their owner cannot send stop.
      }
    }),
  );
}

export async function pingPlexSession(endpoint: PlaybackEndpoint, source: PlexStreamSource) {
  const response = await fetch(sessionURL(endpoint, source.requestContext, source.id, "ping"), {
    signal: AbortSignal.timeout(3000),
  });
  if (!response.ok) throw new Error("Plex could not keep the playback session alive.");
}
