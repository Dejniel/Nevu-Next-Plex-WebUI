import type { MediaVersion } from "./mediaVersions";
import type { VideoSource } from "shared/lib/video/types";
import { browserVideoCapabilities, canDecodeVideo } from "shared/lib/video/capabilities";
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
  copyVideo: boolean;
  copyAudio: boolean;
  videoCodec: string;
  audioCodec: string;
  subtitles: "none" | "sidecar" | "burn";
  subtitle?: Plex.Stream;
}

export interface PlexPlaybackSource extends VideoSource {
  type: PlexPlaybackPlan["protocol"];
  subtitleSessionID?: string;
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
  if (codec === "hevc") return `hvc1.${depth > 8 ? 2 : 1}.4.L${level ?? 153}.B0`;
  if (codec === "av1") return `av01.0.08M.${String(depth).padStart(2, "0")}`;
  if (codec === "vp9")
    return `vp09.${depth > 8 ? "02" : "00"}.41.${String(depth).padStart(2, "0")}`;
  if (codec === "vp8") return "vp8";
  return null;
}

function audioCodecString(codec: string, stream?: Plex.Stream) {
  if (codec === "aac") return /he-aac/i.test(stream?.profile ?? "") ? "mp4a.40.5" : "mp4a.40.2";
  if (codec === "ac3") return "ac-3";
  if (codec === "eac3") return "ec-3";
  if (codec === "mp3") return "mp4a.69";
  if (codec === "opus" || codec === "flac" || codec === "vorbis") return codec;
  if (codec === "alac") return "alac";
  return null;
}

function isTextSubtitle(subtitle: Plex.Stream) {
  return ["srt", "subrip", "vtt", "webvtt", "mov_text", "text"].includes(subtitle.codec);
}

export function playbackPlanKey(plan: PlexPlaybackPlan) {
  return JSON.stringify([
    plan.protocol,
    plan.copyVideo,
    plan.copyAudio,
    plan.videoCodec,
    plan.audioCodec,
    plan.subtitles,
    plan.subtitle?.id,
  ]);
}

export function playbackProfile(plan: PlexPlaybackPlan) {
  return [
    `add-transcode-target(type=videoProfile&context=streaming&protocol=${plan.protocol}&container=${plan.protocol === "dash" ? "mp4" : "mpegts"}&videoCodec=${plan.videoCodec}&audioCodec=${plan.audioCodec}&replace=true)`,
    plan.protocol === "dash" &&
      "add-transcode-target-settings(type=videoProfile&context=streaming&protocol=dash&BreakNonKeyframes=true)",
    "add-transcode-target(type=subtitleProfile&context=all&protocol=http&container=webvtt&subtitleCodec=webvtt&replace=true)",
    "add-settings(DirectPlayStreamSelection=false)",
  ]
    .filter(Boolean)
    .join("+");
}

export async function planMediaPlayback(
  version: MediaVersion,
  quality: MediaPlaybackQuality = {},
  intent: "initial" | "compatible" = "initial",
  probe: VideoCapabilityProbe = browserVideoCapabilities(),
): Promise<PlexPlaybackPlan> {
  const { media, part } = version;
  const streams = part.Stream ?? [];
  const video = streams.find((stream) => stream.streamType === 1);
  const audios = streams.filter((stream) => stream.streamType === 2);
  const audio = audios.find((stream) => stream.selected) ?? audios[0];
  const subtitle = streams.find((stream) => stream.streamType === 3 && stream.selected);
  const videoCodec = video?.codec ?? media.videoCodec ?? "";
  const audioCodec = audio?.codec ?? media.audioCodec ?? "";
  const videoString = videoCodecString(video, videoCodec);
  const audioString = audioCodecString(audioCodec, audio);
  const videoConfiguration: VideoDecodeConfiguration | undefined = videoString
    ? {
        contentType: `video/mp4; codecs="${videoString}"`,
        width: video?.width ?? media.width ?? 1920,
        height: video?.height ?? media.height ?? 1080,
        bitrate: Math.max(1, (video?.bitrate ?? media.bitrate ?? 12000) * 1000),
        framerate: Number.parseFloat(video?.frameRate ?? "24") || 24,
      }
    : undefined;
  const audioConfiguration: AudioDecodeConfiguration | undefined = audioString
    ? {
        contentType: `audio/mp4; codecs="${audioString}"`,
        channels: String(audio?.channels ?? media.audioChannels ?? 2),
        bitrate: Math.max(1, (audio?.bitrate ?? 192) * 1000),
        samplerate: audio?.samplingRate ?? 48000,
      }
    : undefined;
  const hasMSE = probe.mediaSourceSupported('video/mp4; codecs="avc1.640028"');
  if (!hasMSE && !probe.canPlayType("application/vnd.apple.mpegurl"))
    throw new Error("This browser does not support Plex streaming playback.");
  const subtitles = !subtitle ? "none" : isTextSubtitle(subtitle) ? "sidecar" : "burn";
  const dynamicRange = media.videoDynamicRange?.toLowerCase() ?? "sdr";
  const preservePicture =
    intent === "initial" &&
    (quality.bitrate ?? 0) <= 0 &&
    subtitles !== "burn" &&
    !dynamicRange.includes("dolby") &&
    dynamicRange !== "dv" &&
    dynamicRange !== "dovi" &&
    Boolean(videoString);
  const canCopyVideo =
    preservePicture &&
    (hasMSE || videoCodec === "h264") &&
    (await canDecodeVideo(probe, hasMSE ? "media-source" : "file", videoConfiguration));
  const canCopyAudio =
    intent === "initial" &&
    (hasMSE || !audioCodec || ["aac", "mp3", "ac3", "eac3"].includes(audioCodec)) &&
    (!audioCodec ||
      (Boolean(audioString) &&
        (await canDecodeVideo(
          probe,
          hasMSE ? "media-source" : "file",
          undefined,
          audioConfiguration,
        ))));
  const targetVideoCodec = canCopyVideo ? videoCodec : "h264";
  const targetAudioCodec = canCopyAudio && audioCodec ? audioCodec : "aac";
  const protocol = hasMSE ? "dash" : "hls";
  return {
    protocol,
    copyVideo: canCopyVideo,
    copyAudio: canCopyAudio,
    videoCodec: targetVideoCodec,
    audioCodec: targetAudioCodec,
    subtitles,
    subtitle,
  };
}

export function playbackDecisionPlan(
  decision: PlexPlaybackDecision,
  plan: PlexPlaybackPlan,
): PlexPlaybackPlan {
  const container = decision?.MediaContainer;
  if (!container) throw new Error("Plex did not return a playback decision.");
  const code = container.generalDecisionCode ?? container.mdeDecisionCode;
  if (!code || !Number.isFinite(code) || code < 1000)
    throw new Error("Plex did not return a playback decision.");
  if (code >= 2000)
    throw new Error(
      [
        container.generalDecisionText ?? container.mdeDecisionText,
        container.transcodeDecisionCode && container.transcodeDecisionCode >= 2000
          ? container.transcodeDecisionText
          : undefined,
      ]
        .filter((text, index, values) => text && values.indexOf(text) === index)
        .join(" ") || "Plex could not prepare this media for playback.",
    );
  const versions = container.Metadata?.[0]?.Media ?? [];
  const media = versions.find((media) => media.selected) ?? versions[0];
  const part = media?.Part?.find((part) => part.selected) ?? media?.Part?.[0];
  if (part?.decision === "directplay" || code === 1000)
    throw new Error("Plex did not prepare the requested segmented stream.");
  const streams = part?.Stream ?? [];
  const video = streams.find((stream) => stream.streamType === 1);
  const audio =
    streams.find((stream) => stream.streamType === 2 && stream.selected) ??
    streams.find((stream) => stream.streamType === 2 && stream.decision) ??
    streams.find((stream) => stream.streamType === 2);
  const subtitle =
    streams.find((stream) => stream.streamType === 3 && stream.selected) ??
    streams.find((stream) => stream.streamType === 3 && stream.decision);
  if (!video || (video.decision !== "copy" && video.decision !== "transcode"))
    throw new Error("Plex did not prepare a video track for playback.");
  if (
    (media?.protocol && media.protocol !== plan.protocol) ||
    (video?.codec && video.codec !== plan.videoCodec) ||
    (audio?.codec && audio.codec !== plan.audioCodec)
  )
    throw new Error("Plex selected an unsupported streaming format.");
  return {
    ...plan,
    copyVideo: video.decision === "copy",
    copyAudio: audio?.decision ? audio.decision === "copy" : plan.copyAudio,
    videoCodec: video.codec ?? plan.videoCodec,
    audioCodec: audio?.codec ?? plan.audioCodec,
    subtitles: subtitle?.decision === "burn" ? "burn" : plan.subtitles,
  };
}
