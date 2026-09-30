import type { VideoPlaybackError } from "./types";

export function nativeVideoError(error: MediaError): VideoPlaybackError | null {
  if (error.code === 1) return null; // Cancelling a source is normal cleanup.
  const kind =
    error.code === 2 ? "network" : error.code === 3 ? "media" : "unsupported";
  return {
    kind,
    code: error.code,
    message:
      kind === "network"
        ? "The video stream could not be loaded. Check the connection and try again."
        : "This device could not play the video stream.",
  };
}

export function shakaVideoError(error: unknown): VideoPlaybackError | null {
  const detail = (error ?? {}) as {
    code?: number;
    category?: number;
    severity?: number;
  };
  if (detail.code === 7000 || detail.severity === 1) return null;
  const kind =
    detail.category === 1
      ? "network"
      : detail.category === 2
        ? "subtitle"
        : detail.category === 3
          ? "media"
          : detail.category === 4
            ? "unsupported"
            : "unknown";
  return {
    kind,
    code: detail.code,
    message:
      kind === "network"
        ? "The video stream could not be loaded. Check the connection and try again."
        : kind === "subtitle"
          ? "The selected subtitles could not be loaded."
          : "This device could not play the video stream.",
  };
}
