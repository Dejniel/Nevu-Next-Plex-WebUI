import type { Mock } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import MediaExtraPlayback from "./MediaExtraPlayback";
import type { VideoPlayerProps } from "shared/ui/VideoPlayer";
import type { VideoSource } from "shared/lib/video/types";
import type { TitleExtra } from "../model/mediaExtras";
import { resolveDiscoverExtra } from "../api/mediaExtras";

let mockVideoProps: VideoPlayerProps;
let mockCurrentTime: number;
let mockDuration: number;
const mockRecover = vi.fn();
const mockSubtitleError = vi.fn();
vi.mock("../model/useMediaPlaybackSource", () => ({
  useMediaPlaybackSource: () => ({
    source: { id: "source", url: "/file", type: "file" },
    error: null,
    reportError: mockRecover,
    reportSubtitleError: mockSubtitleError,
    reportReady: () => true,
  }),
}));
vi.mock("../api/mediaExtras", () => ({ resolveDiscoverExtra: vi.fn() }));
vi.mock("shared/ui/VideoPlayer", async () => {
  const React = await import("react");
  return {
    default: React.forwardRef(function MockVideo(props: VideoPlayerProps, ref: React.Ref<unknown>) {
      mockVideoProps = props;
      React.useImperativeHandle(ref, () => ({
        getCurrentTime: () => mockCurrentTime,
        getDuration: () => mockDuration,
      }));
      return null;
    }),
  };
});

const extra = {
  source: "local" as const,
  metadata: { ratingKey: "42" } as Plex.Metadata,
};
let root: Root;
let container: HTMLDivElement;
const render = () =>
  act(async () => {
    root.render(<MediaExtraPlayback extra={extra} startTime={12} />);
  });
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  root = createRoot(container);
  vi.clearAllMocks();
  mockDuration = 0;
  mockCurrentTime = 0;
  mockRecover.mockReturnValue(true);
});
afterEach(async () => {
  await act(async () => root.unmount());
});

it("keeps the requested start position when loading fails before playback", async () => {
  await render();
  await act(async () => {
    mockVideoProps.onError!({ sourceId: "source", kind: "media", message: "decode" });
  });
  await render();
  expect(mockVideoProps.startTime).toBe(12);
});

it("retains an explicitly restarted zero position instead of reapplying startTime", async () => {
  await render();
  mockDuration = 100;
  mockCurrentTime = 0;
  await act(async () => {
    mockVideoProps.onError!({ sourceId: "source", kind: "media", message: "decode" });
  });
  await render();
  expect(mockVideoProps.startTime).toBe(0);
});

it("retains native-control play and pause when a local extra changes source", async () => {
  await render();
  await act(async () => mockVideoProps.onPlay!());
  mockCurrentTime = 24;
  await act(async () =>
    mockVideoProps.onError!({ sourceId: "source", kind: "media", message: "decode", position: 24 }),
  );
  await render();
  expect(mockVideoProps.playing).toBe(true);
  expect(mockVideoProps.startTime).toBe(24);
  await act(async () => mockVideoProps.onPause!());
  await act(async () =>
    mockVideoProps.onError!({ sourceId: "source", kind: "media", message: "decode", position: 24 }),
  );
  await render();
  expect(mockVideoProps.playing).toBe(false);
});

const discoverExtra: TitleExtra = { ...extra, source: "discover" };
const discoverSource: VideoSource = {
  id: "trailer",
  url: "https://cdn/trailer.m3u8",
  type: "hls",
};
const renderDiscover = (selected = discoverExtra) =>
  act(async () => {
    root.render(<MediaExtraPlayback extra={selected} startTime={12} />);
  });
const retry = () =>
  act(async () => {
    container.querySelector("button")!.click();
  });

it("shows the preparation failure and retries Discover without reloading the page", async () => {
  (resolveDiscoverExtra as Mock)
    .mockRejectedValueOnce(new Error("Discover unavailable (HTTP 502)."))
    .mockResolvedValueOnce(discoverSource);

  await renderDiscover();
  expect(container.textContent).toContain("Discover unavailable (HTTP 502).");
  expect(container.querySelector("button")!.textContent).toBe("Try again");
  await retry();

  expect(resolveDiscoverExtra).toHaveBeenCalledTimes(2);
  expect(mockVideoProps.source).toEqual(discoverSource);
  expect(container.textContent).not.toContain("Discover unavailable");
});

it("preserves the playback position on retry and resets it for a different extra", async () => {
  (resolveDiscoverExtra as Mock).mockResolvedValue(discoverSource);
  await renderDiscover();
  mockDuration = 100;
  mockCurrentTime = 42;
  await act(async () => {
    mockVideoProps.onError!({
      sourceId: "trailer",
      kind: "network",
      message: "Stream unavailable.",
    });
  });

  await retry();
  expect(mockVideoProps.startTime).toBe(42);
  await renderDiscover({
    ...discoverExtra,
    metadata: { ratingKey: "43" } as Plex.Metadata,
  });
  expect(mockVideoProps.startTime).toBe(12);
});

it("ignores a stale Discover failure after switching to a different extra", async () => {
  let rejectOld!: (reason: Error) => void;
  (resolveDiscoverExtra as Mock)
    .mockReturnValueOnce(
      new Promise<VideoSource>((_, reject) => {
        rejectOld = reject;
      }),
    )
    .mockResolvedValueOnce(discoverSource);
  await renderDiscover();
  await renderDiscover({
    ...discoverExtra,
    metadata: { ratingKey: "43" } as Plex.Metadata,
  });
  await act(async () => {
    rejectOld(new Error("Old request failed."));
  });

  expect(mockVideoProps.source).toEqual(discoverSource);
  expect(container.textContent).not.toContain("Old request failed");
});

it("routes a subtitle warning separately without moving the playhead or restarting", async () => {
  await render();
  await act(async () =>
    mockVideoProps.onSubtitleError!({
      sourceId: "source",
      kind: "subtitle",
      message: "Missing captions",
      position: 24,
    }),
  );
  expect(mockSubtitleError).toHaveBeenCalledTimes(1);
  expect(mockRecover).not.toHaveBeenCalled();
  await render();
  expect(mockVideoProps.startTime).toBe(12);
});
