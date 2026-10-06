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

export async function createStreamingPlayer(source: VideoSource) {
  const shaka = await loadShaka();
  if (!shaka.Player.isBrowserSupported())
    throw new Error("This browser does not support streaming video.");
  const player = new shaka.Player();
  player.configure({
    streaming: {
      bufferingGoal: 30,
      bufferBehind: 30,
      ignoreTextStreamFailures: true,
      inaccurateManifestTolerance: source.seekPreRoll ?? 2,
      retryParameters: { maxAttempts: 3 },
    },
    manifest: { retryParameters: { maxAttempts: 3 } },
    abr: { defaultBandwidthEstimate: 5_000_000, restrictToElementSize: true },
  });
  if (source.stripSegmentInitialization) {
    player.getNetworkingEngine()?.registerResponseFilter(
      (_type, response, context) => {
        if (
          context?.type !==
          shaka.net.NetworkingEngine.AdvancedRequestType.MEDIA_SEGMENT
        ) return;
        // Repeated initialization resets MSE's decoder and drops non-keyframes.
        // The manifest's initialization segment has configured the stream.
        let initializationEnd = 0;
        new shaka.util.Mp4Parser()
          .box("moov", ({ start, size, parser }) => {
            initializationEnd = start + size;
            parser.stop();
          })
          .box("moof", ({ parser }) => parser.stop())
          .parse(response.data);
        if (initializationEnd) {
          response.data = shaka.util.BufferUtils.toUint8(response.data)
            .slice(initializationEnd).buffer;
        }
      },
    );
  }
  return player;
}

export function streamingMimeType(source: VideoSource) {
  return source.type === "hls"
    ? "application/x-mpegURL"
    : "application/dash+xml";
}
