import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import MediaExtraPlayback from "./MediaExtraPlayback";
import type { VideoPlayerProps } from "shared/ui/VideoPlayer";

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
const render = () =>
  act(async () => {
    root.render(<MediaExtraPlayback extra={extra} startTime={12} />);
  });
beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  root = createRoot(document.createElement("div"));
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
