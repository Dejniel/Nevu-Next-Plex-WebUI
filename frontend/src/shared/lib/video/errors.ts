import type { VideoPlaybackError } from "./types";

function httpPlaybackError(status: number): VideoPlaybackError {
  const reason =
    status === 401 || status === 403
      ? "Access to this media was denied."
      : status === 404 || status === 410
        ? "The media file could not be found."
        : "The video stream could not be loaded.";
  return { kind: "network", httpStatus: status, message: `${reason} (HTTP ${status})` };
}

export async function inspectNativeVideoError(error: MediaError, url: string, signal: AbortSignal) {
  const failure = nativeVideoError(error);
  // Native media errors hide HTTP status. Check same-origin sources only after failure.
  if (
    !failure ||
    signal.aborted ||
    error.code === 3 ||
    new URL(url, window.location.href).origin !== window.location.origin
  )
    return failure;
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(abort, 3000);
  try {
    const response = await fetch(url, { method: "HEAD", signal: controller.signal });
    return response.ok ? failure : httpPlaybackError(response.status);
  } catch {
    return failure;
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener("abort", abort);
  }
}

export function nativeVideoError(error: MediaError): VideoPlaybackError | null {
  if (error.code === 1) return null; // Cancelling a source is normal cleanup.
  const kind = error.code === 2 ? "network" : error.code === 3 ? "media" : "unsupported";
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
    data?: unknown[];
  };
  if (detail.code === 7000 || detail.severity === 1) return null;
  if (detail.code === 3016 && typeof detail.data?.[0] === "number") {
    const failure = nativeVideoError({ code: detail.data[0] } as MediaError);
    return failure ? { ...failure, code: detail.code } : null;
  }
  if (detail.code === 1001 && typeof detail.data?.[1] === "number")
    return { ...httpPlaybackError(detail.data[1]), code: detail.code };
  const kind =
    detail.category === 1
      ? "network"
      : detail.category === 2
        ? "subtitle"
        : detail.category === 3
          ? "media"
          : detail.category === 4 && [4006, 4032].includes(detail.code ?? 0)
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
