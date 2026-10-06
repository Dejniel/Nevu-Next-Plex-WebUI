import type { Mock } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import PlaybackScreen from "./PlaybackScreen";
import type { VideoPlayerProps } from "shared/ui/VideoPlayer";
import { usePlaybackTimeline } from "../model/usePlaybackTimeline";

let mockVideoProps: VideoPlayerProps;
let mockCurrentTime: number;
let mockDuration: number;
let mockItemID: string;
let mockPlaybackError: string | undefined;
let mockCanTryOriginal: boolean;
const mockRecover = vi.fn();
const mockSubtitleError = vi.fn();
const mockTryOriginal = vi.fn();
const mockReload = vi.fn();
const mockPauseTogether = vi.fn();
vi.mock("shared/ui", async () => {
  const React = await import("react");
  return {
    AppDialog: ({ open, actions, children }: { open: boolean; actions: React.ReactNode; children: React.ReactNode }) =>
      open ? <div role="dialog">{children}{actions}</div> : null,
    CenteredSpinner: () => null,
    VideoPlayer: React.forwardRef(function MockVideo(
      props: VideoPlayerProps,
      ref: React.Ref<unknown>,
    ) {
      mockVideoProps = props;
      React.useImperativeHandle(ref, () => ({
        getCurrentTime: () => mockCurrentTime,
        getDuration: () => mockDuration,
        seekTo: vi.fn(),
      }));
      return null;
    }),
  };
});
vi.mock("react-router-dom", () => ({
  useParams: () => ({ itemID: mockItemID }),
  useNavigate: () => vi.fn(),
  useSearchParams: () => [new URLSearchParams("t=12000")],
}));
vi.mock("../model/usePlaybackMedia", () => ({
  usePlaybackMedia: (options: { setError: (error: string | false) => void }) => {
    const error = mockPlaybackError;
    const { setError } = options;
    React.useEffect(() => { setError(error || false); }, [error, setError]);
    return {
    metadata: { ratingKey: "42", type: "movie" },
    source: { id: "source", url: "/video", type: "dash" },
    reportSourceError: mockRecover,
    reportSubtitleError: mockSubtitleError,
    reportSourceReady: () => true,
    canTryOriginal: mockCanTryOriginal,
    tryOriginal: mockTryOriginal,
    reloadSource: mockReload,
    };
  },
}));
vi.mock("../model/usePlaybackTimeline", () => ({
  usePlaybackTimeline: vi.fn().mockReturnValue({ reportStopped: vi.fn() }),
}));
vi.mock("features/watch-together/public", () => ({
  useWatchTogetherPlayback: () => ({ pause: mockPauseTogether }),
}));
vi.mock("./PlaybackControlsOverlay", () => ({ default: () => null }));
vi.mock("./PlaybackInfoOverlay", () => ({ default: () => null }));

let root: Root;
let container: HTMLDivElement;
const render = () =>
  act(async () => {
    root.render(<PlaybackScreen />);
  });
beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  (usePlaybackTimeline as Mock).mockReturnValue({
    reportStopped: vi.fn(),
  });
  container = document.createElement("div");
  root = createRoot(container);
  mockItemID = "42";
  mockDuration = 0;
  mockCurrentTime = 0;
  mockPlaybackError = undefined;
  mockCanTryOriginal = false;
  mockTryOriginal.mockReturnValue(true);
  mockRecover.mockReturnValue(true);
});
afterEach(async () => {
  await act(async () => root.unmount());
});

it("preserves initial resume when the first source fails before metadata loads", async () => {
  await render();
  expect(mockVideoProps.startTime).toBe(12);
  await act(async () => {
    mockVideoProps.onError!({
      sourceId: "source",
      kind: "media",
      message: "decode",
    });
  });
  await render();
  expect(mockVideoProps.startTime).toBe(12);
});

it("recovers at the actual position after playback has loaded", async () => {
  await render();
  mockDuration = 100;
  mockCurrentTime = 7.25;
  await act(async () => {
    mockVideoProps.onReady!("source");
  });
  await act(async () => {
    mockVideoProps.onError!({
      sourceId: "source",
      kind: "media",
      message: "decode",
    });
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

it("retains the engine's captured position while paused even after duration disappears", async () => {
  await render();
  await act(async () => mockVideoProps.onPause!());
  expect(mockVideoProps.playing).toBe(false);
  await act(async () =>
    mockVideoProps.onError!({
      sourceId: "source",
      kind: "media",
      message: "decode",
      position: 7.25,
    }),
  );
  await render();
  expect(mockVideoProps.startTime).toBe(7.25);
  expect(mockVideoProps.playing).toBe(false);
});

it("reports subtitle warnings without applying a video fallback position", async () => {
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

const clickOriginal = () => act(async () => {
  const button = Array.from(container.querySelectorAll("button")).find((node) => node.textContent === "Try Original");
  expect(button).toBeDefined();
  button!.click();
});

it("offers Original only when the media model confirms recovery", async () => {
  mockPlaybackError = "Maximum simultaneous video transcodes reached.";
  await render();
  expect(container.textContent).not.toContain("Try Original");
  mockCanTryOriginal = true;
  await render();
  expect(container.textContent).toContain("Try Original");
});

it("tries Original at the initial resume position when no source has loaded", async () => {
  mockPlaybackError = "Server busy";
  mockCanTryOriginal = true;
  await render();
  await clickOriginal();
  expect(mockTryOriginal).toHaveBeenCalledTimes(1);
  expect(mockReload).not.toHaveBeenCalled();
  expect(container.querySelector('[role="dialog"]')).toBeNull();
  expect(mockVideoProps.startTime).toBe(12);
  expect(mockVideoProps.playing).toBe(true);
});

it("tries Original at the captured failure position after the source is cleared", async () => {
  await render();
  await act(async () => mockVideoProps.onError!({ sourceId: "source", kind: "media", message: "decode", position: 7.25 }));
  mockPlaybackError = "Server busy";
  mockCanTryOriginal = true;
  await render();
  await clickOriginal();
  expect(mockVideoProps.startTime).toBe(7.25);
  expect(mockVideoProps.playing).toBe(true);
});

it("keeps the error visible if recovery is no longer available", async () => {
  mockPlaybackError = "Server busy";
  mockCanTryOriginal = true;
  mockTryOriginal.mockReturnValue(false);
  await render();
  await clickOriginal();
  expect(container.querySelector('[role="dialog"]')).not.toBeNull();
  expect(mockVideoProps.playing).toBe(false);
});
