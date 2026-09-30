import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import VideoPlayer from "./VideoPlayer";
import type { VideoPlayerProps } from "./VideoPlayer";
import { createStreamingPlayer } from "shared/lib/video/shaka";
import type { VideoPlayerHandle } from "shared/lib/video/types";

jest.mock("shared/lib/video/shaka", () => ({
  createStreamingPlayer: jest.fn(),
  streamingMimeType: () => "application/dash+xml",
}));
let root: Root;
let element: HTMLDivElement;
let props: VideoPlayerProps;
let handle: React.RefObject<VideoPlayerHandle | null>;
const render = () =>
  act(async () => {
    root.render(<VideoPlayer ref={handle} {...props} />);
  });
function engine() {
  return {
    attach: jest.fn().mockResolvedValue(undefined),
    load: jest.fn().mockResolvedValue(undefined),
    destroy: jest.fn().mockResolvedValue(undefined),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  };
}

beforeEach(() => {
  jest.resetAllMocks();
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  jest.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  jest
    .spyOn(HTMLMediaElement.prototype, "pause")
    .mockImplementation(() => undefined);
  jest
    .spyOn(HTMLMediaElement.prototype, "load")
    .mockImplementation(() => undefined);
  jest
    .spyOn(HTMLMediaElement.prototype, "readyState", "get")
    .mockReturnValue(1);
  element = document.createElement("div");
  root = createRoot(element);
  handle = React.createRef();
  props = {
    source: {
      id: "one",
      url: "/dynproxy/video/:/transcode/universal/start.mpd",
      type: "dash",
    },
    playing: true,
  };
  (createStreamingPlayer as jest.Mock).mockResolvedValue(engine());
});
afterEach(async () => {
  await act(async () => root.unmount());
  jest.restoreAllMocks();
});

it("passes an absolute Plex manifest URL to Shaka", async () => {
  const player = engine();
  (createStreamingPlayer as jest.Mock).mockResolvedValue(player);
  await render();
  expect(player.load).toHaveBeenCalledWith(
    "http://localhost/dynproxy/video/:/transcode/universal/start.mpd",
    null,
    "application/dash+xml",
  );
});

it("passes the resume position to Shaka before its playhead initializes", async () => {
  const player = engine();
  props.startTime = 12.5;
  props.playing = false;
  (createStreamingPlayer as jest.Mock).mockResolvedValue(player);
  await render();
  expect(player.load).toHaveBeenCalledWith(
    expect.any(String),
    12.5,
    "application/dash+xml",
  );
});

it("does not load Shaka for a direct-play file", async () => {
  props.source = { id: "file", url: "/movie.mp4", type: "file" };
  await render();
  expect(createStreamingPlayer).not.toHaveBeenCalled();
  expect(element.querySelector("video")?.getAttribute("src")).toBe(
    "/movie.mp4",
  );
});

it("waits for engine destruction before attaching the next source", async () => {
  let finish!: () => void;
  const first = engine();
  first.destroy.mockReturnValue(
    new Promise<void>((resolve) => {
      finish = resolve;
    }),
  );
  (createStreamingPlayer as jest.Mock)
    .mockResolvedValueOnce(first)
    .mockResolvedValueOnce(engine());
  await render();
  props = {
    ...props,
    source: { ...props.source!, id: "two", url: "/second.mpd" },
  };
  await render();
  expect(first.destroy).toHaveBeenCalledTimes(1);
  expect(createStreamingPlayer).toHaveBeenCalledTimes(1);
  await act(async () => finish());
  expect(createStreamingPlayer).toHaveBeenCalledTimes(2);
});

it("disposes a late engine without attaching it after unmount", async () => {
  let finish!: (player: ReturnType<typeof engine>) => void;
  (createStreamingPlayer as jest.Mock).mockReturnValue(
    new Promise<ReturnType<typeof engine>>((resolve) => {
      finish = resolve;
    }),
  );
  await render();
  await act(async () => root.unmount());
  const player = engine();
  await act(async () => finish(player));
  expect(player.attach).not.toHaveBeenCalled();
  expect(player.destroy).toHaveBeenCalledTimes(1);
});

it("preserves pause while loading a new source", async () => {
  props.playing = false;
  await render();
  expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
});

it("exposes duration only after the streaming source finishes loading", async () => {
  const player = engine();
  let complete!: () => void;
  player.load.mockReturnValue(
    new Promise<void>((resolve) => {
      complete = resolve;
    }),
  );
  (createStreamingPlayer as jest.Mock).mockResolvedValue(player);
  jest
    .spyOn(HTMLMediaElement.prototype, "duration", "get")
    .mockReturnValue(100);
  await render();
  expect(handle.current!.getDuration()).toBe(0);
  await act(async () => complete());
  expect(handle.current!.getDuration()).toBe(100);
});

it("reports autoplay denial without treating it as a codec error", async () => {
  props.onPlayRejected = jest.fn();
  props.onError = jest.fn();
  (HTMLMediaElement.prototype.play as jest.Mock).mockRejectedValue(
    new DOMException("Autoplay blocked", "NotAllowedError"),
  );
  await render();
  expect(props.onPlayRejected).toHaveBeenCalledTimes(1);
  expect(props.onError).not.toHaveBeenCalled();
});

it("waits for native metadata before resuming a paused streaming source", async () => {
  props.playing = false;
  props.onReady = jest.fn();
  const readiness = jest
    .spyOn(HTMLMediaElement.prototype, "readyState", "get")
    .mockReturnValue(0);
  await render();
  expect(props.onReady).not.toHaveBeenCalled();
  readiness.mockReturnValue(1);
  await act(async () => {
    element.querySelector("video")!.dispatchEvent(new Event("loadedmetadata"));
  });
  expect(props.onReady).toHaveBeenCalledTimes(1);
  expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
});
