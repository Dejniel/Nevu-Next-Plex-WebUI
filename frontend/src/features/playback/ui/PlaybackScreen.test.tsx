import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import PlaybackScreen from "./PlaybackScreen";
import type { VideoPlayerProps } from "shared/ui/VideoPlayer";
import { usePlaybackTimeline } from "../model/usePlaybackTimeline";

let mockVideoProps: VideoPlayerProps;
let mockCurrentTime: number;
let mockDuration: number;
let mockItemID: string;
const mockRecover = jest.fn();
jest.mock("shared/ui", () => {
  const React = require("react");
  return {
    AppDialog: () => null,
    CenteredSpinner: () => null,
    VideoPlayer: React.forwardRef(function MockVideo(
      props: VideoPlayerProps,
      ref: React.Ref<unknown>,
    ) {
      mockVideoProps = props;
      React.useImperativeHandle(ref, () => ({
        getCurrentTime: () => mockCurrentTime,
        getDuration: () => mockDuration,
        seekTo: jest.fn(),
      }));
      return null;
    }),
  };
});
jest.mock("react-router-dom", () => ({
  useParams: () => ({ itemID: mockItemID }),
  useNavigate: () => jest.fn(),
  useSearchParams: () => [new URLSearchParams("t=12000")],
}));
jest.mock("../model/usePlaybackMedia", () => ({
  usePlaybackMedia: () => ({
    metadata: { ratingKey: "42", type: "movie" },
    source: { id: "source", url: "/video", type: "file" },
    recoverSource: mockRecover,
  }),
}));
jest.mock("../model/usePlaybackTimeline", () => ({
  usePlaybackTimeline: jest.fn().mockReturnValue({ reportStopped: jest.fn() }),
}));
jest.mock("features/watch-together/public", () => ({
  useWatchTogetherPlayback: () => ({ pause: jest.fn() }),
}));
jest.mock("./PlaybackControlsOverlay", () => () => null);
jest.mock("./PlaybackInfoOverlay", () => () => null);

let root: Root;
const render = () =>
  act(async () => {
    root.render(<PlaybackScreen />);
  });
beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  jest.clearAllMocks();
  (usePlaybackTimeline as jest.Mock).mockReturnValue({
    reportStopped: jest.fn(),
  });
  root = createRoot(document.createElement("div"));
  mockItemID = "42";
  mockDuration = 0;
  mockCurrentTime = 0;
  mockRecover.mockReturnValue(true);
});
afterEach(async () => {
  await act(async () => root.unmount());
});

it("preserves initial resume when the first source fails before metadata loads", async () => {
  await render();
  expect(mockVideoProps.startTime).toBe(12);
  await act(async () => {
    mockVideoProps.onError!({ kind: "media", message: "decode" });
  });
  await render();
  expect(mockVideoProps.startTime).toBe(12);
});

it("recovers at the actual position after playback has loaded", async () => {
  await render();
  mockDuration = 100;
  mockCurrentTime = 7.25;
  await act(async () => {
    mockVideoProps.onReady!();
  });
  await act(async () => {
    mockVideoProps.onError!({ kind: "media", message: "decode" });
  });
  await render();
  expect(mockVideoProps.startTime).toBe(7.25);
});

it("does not report old media progress for a newly selected item", async () => {
  await render();
  mockItemID = "43";
  await render();
  expect(usePlaybackTimeline).toHaveBeenLastCalledWith(
    expect.objectContaining({ itemID: "43", source: null }),
  );
});
