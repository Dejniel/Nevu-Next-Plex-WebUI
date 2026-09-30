import type { MediaVersion } from "./mediaVersions";
import type { VideoSource } from "shared/lib/video/types";
import {
  browserVideoCapabilities,
  canDecodeVideo,
} from "shared/lib/video/capabilities";
import type {
  VideoCapabilityProbe,
  VideoDecodeConfiguration,
  AudioDecodeConfiguration,
} from "shared/lib/video/capabilities";

export interface MediaPlaybackQuality {
  bitrate?: number;
}

export interface PlexPlaybackPlan {
  protocol: "hls" | "dash";
  directPlay: boolean;
  copyVideo: boolean;
  copyAudio: boolean;
  videoCodec: string;
  audioCodec: string;
  subtitles: "none" | "sidecar" | "burn";
  subtitle?: Plex.Stream;
  profile: string;
}

export interface PlexPlaybackSource extends VideoSource {
  mode: "directplay" | "remux" | "audio-transcode" | "video-transcode";
  reason?: string;
  sessionID?: string;
  subtitleSessionID?: string;
  requestContext?: Record<string, unknown>;
}

export interface PlexPlaybackDecision {
  MediaContainer: {
    generalDecisionCode?: number;
    generalDecisionText?: string;
    directPlayDecisionCode?: number;
    directPlayDecisionText?: string;
    transcodeDecisionCode?: number;
    transcodeDecisionText?: string;
    Metadata?: Array<{
      Media?: Array<{
        Part?: Array<{
          decision?: string;
          Stream?: Array<{
            streamType: number;
            decision?: string;
            key?: string;
            codec?: string;
          }>;
        }>;
      }>;
    }>;
  };
}

function videoCodecString(stream: Plex.Stream | undefined, codec: string) {
  const depth = stream?.bitDepth ?? 8;
  const level = stream?.level;
  if (codec === "h264") {
    const profile = stream?.profile?.toLowerCase() ?? "high";
    const id = profile.includes("high 10")
      ? "6e"
      : profile.includes("baseline")
        ? "42"
        : profile.includes("main")
          ? "4d"
          : "64";
    return `avc1.${id}00${Math.round(level ?? 41)
      .toString(16)
      .padStart(2, "0")}`;
  }
  if (codec === "hevc")
    return `hvc1.${depth > 8 ? 2 : 1}.4.L${level ?? 153}.B0`;
  if (codec === "av1") return `av01.0.08M.${String(depth).padStart(2, "0")}`;
  if (codec === "vp9")
    return `vp09.${depth > 8 ? "02" : "00"}.41.${String(depth).padStart(2, "0")}`;
  if (codec === "vp8") return "vp8";
  return null;
}

function audioCodecString(codec: string, stream?: Plex.Stream) {
  if (codec === "aac")
    return /he-aac/i.test(stream?.profile ?? "") ? "mp4a.40.5" : "mp4a.40.2";
  if (codec === "ac3") return "ac-3";
  if (codec === "eac3") return "ec-3";
  if (codec === "mp3") return "mp4a.69";
  if (codec === "opus" || codec === "flac" || codec === "vorbis") return codec;
  if (codec === "alac") return "alac";
  return null;
}

export function mediaContainerMime(container: string) {
  if (["mp4", "m4v", "mov"].includes(container)) return "video/mp4";
  if (container === "webm") return "video/webm";
  if (container === "mkv") return "video/x-matroska";
  if (container === "mpegts") return "video/mp2t";
  return null;
}

export async function planMediaPlayback(
  version: MediaVersion,
  quality: MediaPlaybackQuality = {},
  compatibility = false,
  probe: VideoCapabilityProbe = browserVideoCapabilities(),
): Promise<PlexPlaybackPlan> {
  const { media, part } = version;
  const streams = part.Stream ?? [];
  const video = streams.find((stream) => stream.streamType === 1);
  const audios = streams.filter((stream) => stream.streamType === 2);
  const audio = audios.find((stream) => stream.selected) ?? audios[0];
  const subtitle = streams.find(
    (stream) => stream.streamType === 3 && stream.selected,
  );
  const videoCodec = video?.codec ?? media.videoCodec ?? "";
  const audioCodec = audio?.codec ?? media.audioCodec ?? "";
  const videoString = videoCodecString(video, videoCodec);
  const audioString = audioCodecString(audioCodec, audio);
  const streamContainer = "video/mp4";
  const videoConfig = (
    container: string,
  ): VideoDecodeConfiguration | undefined =>
    videoString
      ? {
          contentType: `${container}; codecs="${videoString}"`,
          width: video?.width ?? media.width ?? 1920,
          height: video?.height ?? media.height ?? 1080,
          bitrate: Math.max(
            1,
            (video?.bitrate ?? media.bitrate ?? 12000) * 1000,
          ),
          framerate: Number.parseFloat(video?.frameRate ?? "24") || 24,
        }
      : undefined;
  const audioConfig = (
    container: string,
  ): AudioDecodeConfiguration | undefined =>
    audioString
      ? {
          contentType: `${container.replace("video/", "audio/")}; codecs="${audioString}"`,
          channels: String(audio?.channels ?? media.audioChannels ?? 2),
          bitrate: Math.max(1, (audio?.bitrate ?? 192) * 1000),
          samplerate: audio?.samplingRate ?? 48000,
        }
      : undefined;
  const hasMSE = probe.mediaSourceSupported('video/mp4; codecs="avc1.640028"');
  const protocol = hasMSE ? "dash" : "hls";
  if (!hasMSE && !probe.canPlayType("application/vnd.apple.mpegurl"))
    throw new Error("This browser does not support Plex streaming playback.");
  const textSubtitle =
    subtitle &&
    ["srt", "subrip", "vtt", "webvtt", "mov_text", "text"].includes(
      subtitle.codec,
    );
  const subtitles = !subtitle
    ? "none"
    : textSubtitle && !compatibility
      ? "sidecar"
      : "burn";
  const bitrateLimited = Boolean(
    quality.bitrate && quality.bitrate > 0 && media.bitrate > quality.bitrate,
  );
  const dynamicRange = media.videoDynamicRange?.toLowerCase() ?? "sdr";
  const preservePicture =
    !compatibility &&
    !bitrateLimited &&
    subtitles !== "burn" &&
    !dynamicRange.includes("dolby") &&
    dynamicRange !== "dv" &&
    dynamicRange !== "dovi" &&
    Boolean(videoString);
  const canCopyVideo =
    preservePicture &&
    (hasMSE || videoCodec === "h264") &&
    (await canDecodeVideo(
      probe,
      hasMSE ? "media-source" : "file",
      videoConfig(streamContainer),
    ));
  const canCopyAudio =
    !compatibility &&
    (hasMSE ||
      !audioCodec ||
      ["aac", "mp3", "ac3", "eac3"].includes(audioCodec)) &&
    (!audioCodec ||
      (Boolean(audioString) &&
        (await canDecodeVideo(
          probe,
          hasMSE ? "media-source" : "file",
          undefined,
          audioConfig(streamContainer),
        ))));
  const container = part.container ?? media.container ?? "";
  const mime = mediaContainerMime(container);
  const directPlay =
    preservePicture &&
    !compatibility &&
    (!audioCodec || Boolean(audioString)) &&
    Boolean(mime) &&
    (!audio || audio === audios[0]) &&
    (await canDecodeVideo(
      probe,
      "file",
      videoConfig(mime!),
      audioCodec ? audioConfig(mime!) : undefined,
    ));
  const targetVideoCodec = canCopyVideo ? videoCodec : "h264";
  const targetAudioCodec = canCopyAudio && audioCodec ? audioCodec : "aac";
  const targetContainer = hasMSE ? "mp4" : "mpegts";
  const directives = [
    `add-transcode-target(type=videoProfile&context=streaming&protocol=${protocol}&container=${targetContainer}&videoCodec=${targetVideoCodec}&audioCodec=${targetAudioCodec}&replace=true)`,
    "add-transcode-target(type=subtitleProfile&context=all&protocol=http&container=webvtt&subtitleCodec=webvtt&replace=true)",
    "add-settings(DirectPlayStreamSelection=false)",
  ];
  if (directPlay)
    directives.push(
      `add-direct-play-profile(type=videoProfile&container=${container}&videoCodec=${videoCodec}&audioCodec=${audioCodec || "*"}&subtitleCodec=*)`,
    );
  return {
    protocol,
    directPlay,
    copyVideo: canCopyVideo,
    copyAudio: canCopyAudio,
    videoCodec: targetVideoCodec,
    audioCodec: targetAudioCodec,
    subtitles,
    subtitle,
    profile: directives.join("+"),
  };
}

export function playbackDecisionMode(
  decision: PlexPlaybackDecision,
  plan: PlexPlaybackPlan,
) {
  const container = decision?.MediaContainer;
  if (!container) throw new Error("Plex did not return a playback decision.");
  if (container.generalDecisionCode && container.generalDecisionCode >= 2000)
    throw new Error(
      container.generalDecisionText ||
        "Plex could not prepare this media for playback.",
    );
  const part = container.Metadata?.[0]?.Media?.[0]?.Part?.[0];
  if (
    plan.directPlay &&
    (container.directPlayDecisionCode === 1000 ||
      part?.decision === "directplay")
  )
    return "directplay" as const;
  const streams = part?.Stream ?? [];
  if (
    !plan.copyVideo ||
    streams.some(
      (stream) => stream.streamType === 1 && stream.decision === "transcode",
    )
  )
    return "video-transcode" as const;
  if (
    !plan.copyAudio ||
    streams.some(
      (stream) => stream.streamType === 2 && stream.decision === "transcode",
    )
  )
    return "audio-transcode" as const;
  return "remux" as const;
}
