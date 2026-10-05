import type { Mock } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import VideoPlayer from "./VideoPlayer";
import type { VideoPlayerProps } from "./VideoPlayer";
import { createStreamingPlayer } from "shared/lib/video/shaka";
import type { VideoPlayerHandle } from "shared/lib/video/types";

vi.mock("shared/lib/video/shaka", () => ({
  createStreamingPlayer: vi.fn(),
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
    attach: vi.fn().mockResolvedValue(undefined),
    load: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn().mockResolvedValue(undefined),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(
    () => undefined,
  );
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(
    () => undefined,
  );
  vi.spyOn(HTMLMediaElement.prototype, "readyState", "get").mockReturnValue(1);
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
  (createStreamingPlayer as Mock).mockResolvedValue(engine());
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.restoreAllMocks();
});

it("passes an absolute Plex manifest URL to Shaka", async () => {
  const player = engine();
  (createStreamingPlayer as Mock).mockResolvedValue(player);
  await render();
  expect(player.load).toHaveBeenCalledWith(
    `${window.location.origin}/dynproxy/video/:/transcode/universal/start.mpd`,
    null,
    "application/dash+xml",
  );
});

it("passes the resume position to Shaka before its playhead initializes", async () => {
  const player = engine();
  props.startTime = 12.5;
  props.playing = false;
  (createStreamingPlayer as Mock).mockResolvedValue(player);
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

it("loads text tracks after video readiness without restarting the video", async () => {
  const loadTextTracks = vi
    .fn()
    .mockResolvedValue({
      tracks: [{ url: "/subs.vtt", language: "eng", label: "English" }],
    });
  props.source = {
    id: "file",
    url: "/movie.mp4",
    type: "file",
    loadTextTracks,
  };
  await render();
  expect(loadTextTracks).not.toHaveBeenCalled();
  await act(async () =>
    element.querySelector("video")!.dispatchEvent(new Event("loadedmetadata")),
  );
  expect(loadTextTracks).toHaveBeenCalledTimes(1);
  expect(element.querySelector("track")?.getAttribute("src")).toBe("/subs.vtt");
  expect(HTMLMediaElement.prototype.load).toHaveBeenCalledTimes(1);
  expect(createStreamingPlayer).not.toHaveBeenCalled();
});

it("cancels late text-track loading when the source changes", async () => {
  let finish!: (value: { tracks: [] }) => void;
  let signal!: AbortSignal;
  props.source = {
    id: "file",
    url: "/movie.mp4",
    type: "file",
    loadTextTracks: (requestSignal) => {
      signal = requestSignal;
      return new Promise((resolve) => {
        finish = resolve;
      });
    },
  };
  await render();
  await act(async () =>
    element.querySelector("video")!.dispatchEvent(new Event("loadedmetadata")),
  );
  props.source = { id: "second", url: "/second.mp4", type: "file" };
  await render();
  expect(signal.aborted).toBe(true);
  await act(async () => finish({ tracks: [] }));
  expect(element.querySelector("track")).toBeNull();
});

it("reports native track failures with source identity and position, then detaches the listener", async () => {
  const onError = vi.fn();
  props.source = {
    id: "file",
    url: "/movie.mp4",
    type: "file",
    textTracks: [{ url: "/subs.vtt", language: "eng", label: "English" }],
  };
  props.onError = onError;
  await render();
  const video = element.querySelector("video")!;
  Object.defineProperty(video, "duration", { value: 60 });
  video.currentTime = 24;
  await act(async () => {
    video.dispatchEvent(new Event("loadedmetadata"));
    video.dispatchEvent(new Event("timeupdate"));
  });
  const track = element.querySelector("track")!;
  track.dispatchEvent(new Event("error"));
  expect(onError).toHaveBeenCalledWith(
    expect.objectContaining({
      sourceId: "file",
      kind: "subtitle",
      position: 24,
    }),
  );
  props.source = { id: "second", url: "/second.mp4", type: "file" };
  await render();
  track.dispatchEvent(new Event("error"));
  expect(onError).toHaveBeenCalledTimes(1);
});

it("retains the playhead when lazy subtitle preparation fails", async () => {
  let finish!: (value: {
    error: { kind: "network"; message: string; httpStatus: number };
  }) => void;
  props.source = {
    id: "file",
    url: "/movie.mp4",
    type: "file",
    loadTextTracks: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  };
  props.onError = vi.fn();
  await render();
  const video = element.querySelector("video")!;
  Object.defineProperty(video, "duration", { value: 60 });
  await act(async () => video.dispatchEvent(new Event("loadedmetadata")));
  video.currentTime = 24;
  await act(async () =>
    finish({
      error: {
        kind: "network",
        message: "Subtitles unavailable",
        httpStatus: 403,
      },
    }),
  );
  expect(props.onError).toHaveBeenCalledWith(
    expect.objectContaining({
      sourceId: "file",
      position: 24,
      httpStatus: 403,
    }),
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
  (createStreamingPlayer as Mock)
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
  (createStreamingPlayer as Mock).mockReturnValue(
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
  (createStreamingPlayer as Mock).mockResolvedValue(player);
  vi.spyOn(HTMLMediaElement.prototype, "duration", "get").mockReturnValue(100);
  await render();
  expect(handle.current!.getDuration()).toBe(0);
  await act(async () => complete());
  expect(handle.current!.getDuration()).toBe(100);
});

it("reports autoplay denial without treating it as a codec error", async () => {
  props.onPlayRejected = vi.fn();
  props.onError = vi.fn();
  (HTMLMediaElement.prototype.play as Mock).mockRejectedValue(
    new DOMException("Autoplay blocked", "NotAllowedError"),
  );
  await render();
  expect(props.onPlayRejected).toHaveBeenCalledTimes(1);
  expect(props.onError).not.toHaveBeenCalled();
});

it("waits for native metadata before resuming a paused streaming source", async () => {
  props.playing = false;
  props.onReady = vi.fn();
  const readiness = vi
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

it("reports the source identity and last position after native metadata is lost", async () => {
  props.source = { id: "file", url: "/movie.mp4", type: "file" };
  props.onError = vi.fn();
  const duration = vi
    .spyOn(HTMLMediaElement.prototype, "duration", "get")
    .mockReturnValue(100);
  await render();
  const video = element.querySelector("video")!;
  Object.defineProperty(video, "error", {
    configurable: true,
    value: { code: 3 },
  });
  await act(async () => video.dispatchEvent(new Event("loadedmetadata")));
  video.currentTime = 7.25;
  await act(async () => video.dispatchEvent(new Event("timeupdate")));
  duration.mockReturnValue(NaN);
  video.currentTime = 0;
  await act(async () => video.dispatchEvent(new Event("error")));
  expect(props.onError).toHaveBeenCalledWith(
    expect.objectContaining({
      sourceId: "file",
      kind: "media",
      position: 7.25,
    }),
  );
});

it("ignores an old Shaka error after the next source starts", async () => {
  const first = engine();
  (createStreamingPlayer as Mock)
    .mockResolvedValueOnce(first)
    .mockResolvedValueOnce(engine());
  props.onError = vi.fn();
  await render();
  const oldError = first.addEventListener.mock.calls[0][1];
  props = { ...props, source: { ...props.source!, id: "second" } };
  await render();
  await act(async () =>
    oldError({ detail: { category: 3, code: 3016, severity: 2 } }),
  );
  expect(props.onError).not.toHaveBeenCalled();
});

it("cancels a native HTTP check and ignores its response after switching sources", async () => {
  let complete!: (response: { ok: boolean; status: number }) => void;
  const request = vi.fn().mockReturnValue(
    new Promise((resolve) => {
      complete = resolve;
    }),
  );
  vi.stubGlobal("fetch", request);
  props.source = { id: "file", url: "/movie.mp4", type: "file" };
  props.onError = vi.fn();
  await render();
  Object.defineProperty(element.querySelector("video")!, "error", {
    configurable: true,
    value: { code: 4 },
  });
  await act(async () =>
    element.querySelector("video")!.dispatchEvent(new Event("error")),
  );
  const signal = request.mock.calls[0][1].signal;
  props = {
    ...props,
    source: { id: "second", url: "/second.mp4", type: "file" },
  };
  await render();
  expect(signal.aborted).toBe(true);
  await act(async () => complete({ ok: false, status: 403 }));
  expect(props.onError).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});
