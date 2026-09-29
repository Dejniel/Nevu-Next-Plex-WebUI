import { parseStoredPlaybackQuality } from "./playbackSource";

describe("stored playback quality", () => {
  it("restores a valid bitrate", () => {
    expect(parseStoredPlaybackQuality("12000")).toEqual({ bitrate: 12000 });
  });

  it("ignores missing and invalid values", () => {
    expect(parseStoredPlaybackQuality(null)).toEqual({});
    expect(parseStoredPlaybackQuality("invalid")).toEqual({});
  });
});
