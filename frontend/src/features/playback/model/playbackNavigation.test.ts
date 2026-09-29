import {
  activePlaybackMarker,
  playbackAdvancePath,
  playbackBrowsePath,
} from "./playbackNavigation";

const movie = {
  type: "movie",
  ratingKey: "10",
  librarySectionID: 2,
} as Plex.Metadata;
const episode = {
  type: "episode",
  ratingKey: "20",
  grandparentRatingKey: "15",
  librarySectionID: 3,
} as Plex.Metadata;

it("builds browse destinations for movies and episodes", () => {
  expect(playbackBrowsePath(movie)).toBe("/browse/2?mid=10");
  expect(playbackBrowsePath(episode)).toBe("/browse/3?mid=15");
});

it("advances episodes and falls back to their show", () => {
  const queue = [episode, { ratingKey: "21" } as Plex.Metadata];

  expect(playbackAdvancePath(episode, queue)).toBe("/watch/21");
  expect(playbackAdvancePath(episode, queue, true)).toBe("/watch/21?t=0");
  expect(playbackAdvancePath(episode, null)).toBe("/browse/3?mid=15");
  expect(playbackAdvancePath(movie, queue)).toBe("/browse/2?mid=10");
});

it("finds only the marker covering the current playback position", () => {
  const marker = {
    id: 1,
    type: "intro",
    final: false,
    startTimeOffset: 10_000,
    endTimeOffset: 20_000,
  };
  const metadata = { Marker: [marker] } as Plex.Metadata;

  expect(activePlaybackMarker(metadata, 15)).toBe(marker);
  expect(activePlaybackMarker(metadata, 25)).toBeUndefined();
});
