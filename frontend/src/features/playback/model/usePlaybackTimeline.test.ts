import { currentTimelineState } from "./usePlaybackTimeline";

it("prioritizes buffering over the playing state", () => {
  expect(currentTimelineState(true, true)).toBe("buffering");
  expect(currentTimelineState(false, true)).toBe("buffering");
  expect(currentTimelineState(true, false)).toBe("playing");
  expect(currentTimelineState(false, false)).toBe("paused");
});
