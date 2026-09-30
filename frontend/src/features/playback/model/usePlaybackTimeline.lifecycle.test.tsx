import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { getTimelineUpdate } from "../api/playback";
import { pingMediaPlayback } from "entities/media/model";
import { usePlaybackTimeline } from "./usePlaybackTimeline";
import type { PlexPlaybackSource } from "entities/media/model";

jest.mock("../api/playback", () => ({
  getTimelineUpdate: jest.fn().mockResolvedValue({ MediaContainer: {} }),
}));
jest.mock("entities/media/model", () => ({
  pingMediaPlayback: jest.fn().mockResolvedValue(undefined),
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
    onTermination: jest.fn(),
  });
  return null;
}
const render = () =>
  act(async () => {
    root.render(<Harness />);
  });
beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
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
  jest.useRealTimers();
});
it("does not report an unloaded video and pings only the owned source", async () => {
  await render();
  await act(async () => {
    jest.advanceTimersByTime(10000);
  });
  expect(getTimelineUpdate).not.toHaveBeenCalled();
  expect(pingMediaPlayback).not.toHaveBeenCalled();
  source = {
    id: "source",
    url: "/stream",
    type: "dash",
    mode: "remux",
    sessionID: "owned",
  };
  await render();
  await act(async () => {
    jest.advanceTimersByTime(10000);
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
  source = { id: "source", url: "/file", type: "file", mode: "directplay" };
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
  source = { id: "source", url: "/file", type: "file", mode: "directplay" };
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
  source = { id: "original", url: "/file", type: "file", mode: "directplay" };
  await render();
  source = {
    id: "replacement",
    url: "/stream",
    type: "dash",
    mode: "video-transcode",
    sessionID: "replacement",
  };
  time = 12;
  await render();
  await act(async () => {
    jest.advanceTimersByTime(5000);
  });
  expect(getTimelineUpdate).toHaveBeenCalledWith(
    42,
    100000,
    "playing",
    12000,
    "replacement",
  );
});
