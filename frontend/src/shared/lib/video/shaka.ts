import type Shaka from "shaka-player";
import type { VideoSource } from "./types";

let library: Promise<typeof Shaka> | undefined;

export function loadShaka() {
  if (!library) {
    library = import("shaka-player")
      .then(({ default: shaka }) => {
        shaka.polyfill.installAll();
        return shaka;
      })
      .catch((error) => {
        library = undefined;
        throw error;
      });
  }
  return library;
}

export async function createStreamingPlayer(video: HTMLVideoElement) {
  const shaka = await loadShaka();
  if (!shaka.Player.isBrowserSupported())
    throw new Error("This browser does not support streaming video.");
  const player = new shaka.Player();
  player.configure({
    streaming: {
      bufferingGoal: 30,
      bufferBehind: 30,
      retryParameters: { maxAttempts: 3 },
      preferNativeHls: Boolean(
        video.canPlayType("application/vnd.apple.mpegurl"),
      ),
    },
    manifest: { retryParameters: { maxAttempts: 3 } },
    abr: { defaultBandwidthEstimate: 5_000_000, restrictToElementSize: true },
  });
  return player;
}

export function streamingMimeType(source: VideoSource) {
  return source.type === "hls"
    ? "application/x-mpegURL"
    : "application/dash+xml";
}
