import {
  createSharedPlaybackState,
  sharedPlaybackPath,
  shouldCorrectPlaybackPosition,
} from "./playback";

describe("watch-together playback model", () => {
  it("builds the state sent by a host", () => {
    expect(createSharedPlaybackState("42", false, 12.5)).toEqual({
      key: "42",
      state: "paused",
      time: 12.5,
    });
  });

  it("corrects drift beyond the tolerance, including a target at zero", () => {
    expect(shouldCorrectPlaybackPosition(3, 0)).toBe(true);
    expect(shouldCorrectPlaybackPosition(1.5, 0)).toBe(false);
    expect(shouldCorrectPlaybackPosition(20, undefined)).toBe(false);
  });

  it("builds playback routes without an undefined time", () => {
    expect(sharedPlaybackPath({ key: "42", state: "playing" })).toBe(
      "/watch/42",
    );
    expect(sharedPlaybackPath({ key: "42", state: "playing", time: 0 })).toBe(
      "/watch/42?t=0",
    );
    expect(sharedPlaybackPath({ state: "paused" })).toBeNull();
  });
});
