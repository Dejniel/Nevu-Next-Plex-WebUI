import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { getTimelineUpdate } from "../api/playback";
import { pingMediaPlayback } from "entities/media/model";
import { usePlaybackTimeline } from "./usePlaybackTimeline";
import type { PlexPlaybackSource } from "entities/media/model";

vi.mock("../api/playback", () => ({
  getTimelineUpdate: vi.fn().mockResolvedValue({ MediaContainer: {} }),
}));
vi.mock("entities/media/model", () => ({
  pingMediaPlayback: vi.fn().mockResolvedValue(undefined),
}));
let root: Root;
let itemID: string;
let time: number;
let duration: number;
let source: PlexPlaybackSource | null;
let controller: ReturnType<typeof usePlaybackTimeline>;
function Harness() {
  controller = usePlaybackTimeline({
    itemID,
    source,
    playing: true,
    buffering: false,
    getCurrentTime: () => time,
    getDuration: () => duration,
    onTermination: vi.fn(),
  });
  return null;
}
const render = () =>
  act(async () => {
    root.render(<Harness />);
  });
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  root = createRoot(document.createElement("div"));
  itemID = "42";
  time = 7.25;
  duration = 100;
  source = null;
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.useRealTimers();
});
it("does not report an unloaded video and pings only the owned source", async () => {
  await render();
  await act(async () => {
    vi.advanceTimersByTime(10000);
  });
  expect(getTimelineUpdate).not.toHaveBeenCalled();
  expect(pingMediaPlayback).not.toHaveBeenCalled();
  source = {
    id: "source",
    url: "/stream",
    type: "dash",
    requestContext: {},
  };
  await render();
  await act(async () => {
    vi.advanceTimersByTime(10000);
  });
  expect(getTimelineUpdate).toHaveBeenCalledWith(
    42,
    100000,
    "playing",
    7250,
    "source",
  );
  expect(pingMediaPlayback).toHaveBeenCalledWith(source);
});
it("reports the last position once when explicit exit is followed by unmount", async () => {
  source = { id: "source", url: "/stream", type: "dash", requestContext: {} };
  await render();
  await act(async () => {
    await controller.reportStopped();
    root.unmount();
  });
  expect(getTimelineUpdate).toHaveBeenCalledTimes(1);
  expect(getTimelineUpdate).toHaveBeenCalledWith(
    42,
    100000,
    "stopped",
    7250,
    "source",
  );
});
it("stops the old item with its own position when navigation changes the item", async () => {
  source = { id: "source", url: "/stream", type: "dash", requestContext: {} };
  await render();
  itemID = "43";
  source = null;
  time = 0;
  duration = 0;
  await render();
  expect(getTimelineUpdate).toHaveBeenCalledWith(
    42,
    100000,
    "stopped",
    7250,
    "source",
  );
});

it("reports a changed stream using its new source session", async () => {
  source = { id: "initial", url: "/stream", type: "dash", requestContext: {} };
  await render();
  source = {
    id: "replacement",
    url: "/stream",
    type: "dash",
    requestContext: {},
  };
  time = 12;
  await render();
  await act(async () => {
    vi.advanceTimersByTime(5000);
  });
  expect(getTimelineUpdate).toHaveBeenCalledWith(
    42,
    100000,
    "playing",
    12000,
    "replacement",
  );
});
