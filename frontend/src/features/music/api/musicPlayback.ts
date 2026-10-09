import type { MediaMetadata } from "entities/media/model";
import {
  playbackDecisionStreams,
  preparePlexPlayback,
  plexMediaURL,
  releasePlexSessions,
  pingPlexSession,
} from "shared/api/plexPlayback";
import type { PlexStreamSource } from "shared/api/plexPlayback";
import { browserVideoCapabilities } from "shared/lib/video/capabilities";
import { uuidV4 } from "shared/lib/identifiers";
import type { VideoSource } from "shared/lib/video/types";

export type AudioSource = PlexStreamSource | (VideoSource & {
  type: "file";
  requestContext: Record<string, unknown>;
});

export async function prepareAudioPlayback(
  item: MediaMetadata,
  context: Record<string, unknown>,
  converted: boolean,
  signal: AbortSignal,
): Promise<AudioSource> {
  signal.throwIfAborted();
  const part = item.Media?.[0]?.Part?.[0];
  if (!part?.key) throw new Error("This track has no available audio file.");
  if (!converted)
    return {
      id: uuidV4(),
      type: "file",
      requestContext: { ...context },
      url: plexMediaURL(part.key, context),
    };
  const probe = browserVideoCapabilities();
  const protocol = probe.mediaSourceSupported('audio/mp4; codecs="mp4a.40.2"') ? "dash" : "hls";
  if (protocol === "hls" && !probe.canPlayType("application/vnd.apple.mpegurl"))
    throw new Error("This browser does not support Plex audio streaming.");
  const { source } = await preparePlexPlayback("audio", {
    path: `/library/metadata/${item.ratingKey}`,
    mediaIndex: 0,
    partIndex: 0,
    protocol,
    directPlay: 0,
    directStream: 0,
    directStreamAudio: 0,
    audioBitrate: 320,
    "X-Plex-Client-Profile-Name": "Generic",
    "X-Plex-Client-Profile-Extra": `add-transcode-target(type=musicProfile&context=streaming&protocol=${protocol}&container=${protocol === "dash" ? "mp4" : "mpegts"}&audioCodec=aac)`,
  }, context, signal, (decision) => {
    const streams = playbackDecisionStreams(decision, protocol);
    const audios = streams.filter((stream) => stream.streamType === 2);
    const audio =
      audios.find((stream) => stream.selected) ?? audios.find((stream) => stream.decision) ?? audios[0];
    if (!audio || !["copy", "transcode"].includes(audio.decision ?? ""))
      throw new Error("Plex did not prepare an audio track for playback.");
    if (
      audio.codec !== "aac" ||
      streams.some((stream) => stream.streamType === 1 && ["copy", "transcode"].includes(stream.decision ?? ""))
    )
      throw new Error("Plex selected an unsupported audio streaming format.");
    return { protocol };
  });
  return source;
}

export async function releaseAudioPlayback(source: AudioSource | null, keepalive = false) {
  if (!source || source.type === "file") return;
  await releasePlexSessions("audio", source.requestContext, [source.id], keepalive);
}

export async function pingAudioPlayback(source: AudioSource) {
  if (source.type !== "file") await pingPlexSession("audio", source);
}
