import {
  formatPlaybackTime,
  getPlaybackQualityOptions,
} from "./playbackPresentation";

it("formats playback time with hours only when needed", () => {
  expect(formatPlaybackTime(65)).toBe("01:05");
  expect(formatPlaybackTime(3665)).toBe("1:01:05");
});

it("does not offer qualities above the source resolution", () => {
  expect(getPlaybackQualityOptions("720")[1]).toMatchObject({
    title: "Convert to 720p",
    bitrate: 4000,
  });
  expect(getPlaybackQualityOptions("4k")[1]).toMatchObject({
    title: "Convert to 4K",
    bitrate: 60000,
  });
  expect(getPlaybackQualityOptions("360")[1].title).toBe("Convert to 360p");
});

it("offers Original for every source resolution", () => {
  expect(getPlaybackQualityOptions("720")[0]).toMatchObject({
    title: "Original",
    bitrate: -1,
  });
});
