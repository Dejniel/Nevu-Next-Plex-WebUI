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
const mockRecover = jest.fn();
jest.mock("../model/useMediaPlaybackSource", () => ({
  useMediaPlaybackSource: () => ({
    source: { id: "source", url: "/file", type: "file" },
    error: null,
    recover: mockRecover,
  }),
}));
jest.mock("../api/mediaExtras", () => ({ resolveDiscoverExtra: jest.fn() }));
jest.mock("shared/ui/VideoPlayer", () => {
  const React = require("react");
  return React.forwardRef(function MockVideo(
    props: VideoPlayerProps,
    ref: React.Ref<unknown>,
  ) {
    mockVideoProps = props;
    React.useImperativeHandle(ref, () => ({
      getCurrentTime: () => mockCurrentTime,
      getDuration: () => mockDuration,
    }));
    return null;
  });
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
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  root = createRoot(container);
  jest.clearAllMocks();
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
    mockVideoProps.onError!({ kind: "media", message: "decode" });
  });
  await render();
  expect(mockVideoProps.startTime).toBe(12);
});

it("retains an explicitly restarted zero position instead of reapplying startTime", async () => {
  await render();
  mockDuration = 100;
  mockCurrentTime = 0;
  await act(async () => {
    mockVideoProps.onError!({ kind: "media", message: "decode" });
  });
  await render();
  expect(mockVideoProps.startTime).toBe(0);
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
  (resolveDiscoverExtra as jest.Mock)
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
  (resolveDiscoverExtra as jest.Mock).mockResolvedValue(discoverSource);
  await renderDiscover();
  mockDuration = 100;
  mockCurrentTime = 42;
  await act(async () => {
    mockVideoProps.onError!({
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
  (resolveDiscoverExtra as jest.Mock)
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
