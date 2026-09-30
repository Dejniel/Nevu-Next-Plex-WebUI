export interface VideoDecodeConfiguration {
  contentType: string;
  width: number;
  height: number;
  bitrate: number;
  framerate: number;
}

export interface AudioDecodeConfiguration {
  contentType: string;
  channels: string;
  bitrate: number;
  samplerate: number;
}

export interface VideoCapabilityProbe {
  canPlayType: (contentType: string) => boolean;
  mediaSourceSupported: (contentType: string) => boolean;
  decodingInfo?: (
    configuration: MediaDecodingConfiguration,
  ) => Promise<MediaCapabilitiesInfo>;
}

export function browserVideoCapabilities(): VideoCapabilityProbe {
  const video = document.createElement("video");
  const mediaSource =
    window.MediaSource ??
    (window as Window & { ManagedMediaSource?: typeof MediaSource })
      .ManagedMediaSource;
  return {
    canPlayType: (contentType) => Boolean(video.canPlayType(contentType)),
    mediaSourceSupported: (contentType) =>
      Boolean(mediaSource?.isTypeSupported(contentType)),
    decodingInfo: navigator.mediaCapabilities?.decodingInfo.bind(
      navigator.mediaCapabilities,
    ),
  };
}

export async function canDecodeVideo(
  probe: VideoCapabilityProbe,
  type: "file" | "media-source",
  video?: VideoDecodeConfiguration,
  audio?: AudioDecodeConfiguration,
) {
  const supported =
    type === "file" ? probe.canPlayType : probe.mediaSourceSupported;
  if (
    (video && !supported(video.contentType)) ||
    (audio && !supported(audio.contentType))
  )
    return false;
  if (!video && !audio) return false;
  if (!probe.decodingInfo) return true;
  try {
    return (await probe.decodingInfo({ type, video, audio })).supported;
  } catch {
    // Some browsers do not implement every MediaCapabilities query type.
    return true;
  }
}
