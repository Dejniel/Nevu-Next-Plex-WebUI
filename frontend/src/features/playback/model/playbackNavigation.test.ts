import type { MediaMetadata } from "entities/media/model";
import {
  activePlaybackMarker,
  playbackAdvancePath,
  playbackBrowsePath,
} from "./playbackNavigation";
import {
  parsePlaylistContext,
  playlistWatchPath,
} from "features/media-lists/model";

const movie = {
  type: "movie",
  ratingKey: "10",
  librarySectionID: 2,
} as MediaMetadata;
const episode = {
  type: "episode",
  ratingKey: "20",
  grandparentRatingKey: "15",
  librarySectionID: 3,
} as MediaMetadata;

it("builds browse destinations for movies and episodes", () => {
  expect(playbackBrowsePath(movie)).toBe("/browse/2?mid=10");
  expect(playbackBrowsePath(episode)).toBe("/browse/3?mid=15");
});

it("advances episodes and falls back to their show", () => {
  const queue = [episode, { ratingKey: "21" } as MediaMetadata];

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
  const metadata = { Marker: [marker] } as MediaMetadata;

  expect(activePlaybackMarker(metadata, 15)).toBe(marker);
  expect(activePlaybackMarker(metadata, 25)).toBeUndefined();
});

it("advances movies and repeated titles in playlist order and returns to that playlist", () => {
  const context = { id: "30", index: 4, libraryID: "2" };
  expect(playbackAdvancePath(movie, [movie, movie], true, context)).toBe(
    "/watch/10?playlist=30&position=5&fromLibrary=2&t=0",
  );
  expect(playbackAdvancePath(movie, [movie], false, context)).toBe(
    "/browse/2?list=30&view=playlists",
  );
  expect(playbackBrowsePath(episode, { id: "30", index: 2 })).toBe(
    "/playlists?list=30",
  );
  expect(playlistWatchPath({ ...movie, viewOffset: 5000 }, context)).toContain(
    "t=5000",
  );
});

it("accepts only valid playlist positions and IDs from URLs", () => {
  expect(
    parsePlaylistContext(
      new URLSearchParams("playlist=30&position=0&fromLibrary=2"),
    ),
  ).toEqual({ id: "30", index: 0, libraryID: "2" });
  for (const value of [
    "playlist=30",
    "playlist=30&position=-1",
    "playlist=30&position=1.5",
    "playlist=x&position=0",
    "playlist=30&position=99999999999999999",
  ])
    expect(parsePlaylistContext(new URLSearchParams(value))).toBeUndefined();
});

it("carries the next occurrence ID without reusing the previous occurrence", () => {
  const next = { ...movie, playlistItemID: 81 };
  const path = playbackAdvancePath(movie, [movie, next], false, {
    id: "30",
    index: 4,
    itemID: "80",
  });
  expect(
    parsePlaylistContext(new URLSearchParams(path.split("?")[1])),
  ).toMatchObject({ id: "30", index: 5, itemID: "81" });
});
