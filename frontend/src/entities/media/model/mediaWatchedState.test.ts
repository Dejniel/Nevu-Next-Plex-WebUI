import type { LibraryCardDto } from "@nevu/contracts";
import { applyMediaWatchedState, isMediaWatched } from "./mediaWatchedState";

it.each(["movie", "episode"] as const)("recognizes the view count of a %s", (type) => {
  expect(isMediaWatched({ type })).toBe(false);
  expect(isMediaWatched({ type, viewCount: 0 })).toBe(false);
  expect(isMediaWatched({ type, viewCount: 2 })).toBe(true);
  expect(isMediaWatched({ type, viewCount: -1 })).toBe(false);
});

it("requires all known episodes to be watched before marking a show watched", () => {
  expect(isMediaWatched({ type: "show", leafCount: 5, viewedLeafCount: 5 })).toBe(true);
  expect(isMediaWatched({ type: "show", leafCount: 5, viewedLeafCount: 4 })).toBe(false);
  expect(isMediaWatched({ type: "show", leafCount: 5, viewCount: 1 })).toBe(false);
});

it.each([
  {},
  { leafCount: 0, viewedLeafCount: 0 },
  { viewedLeafCount: 1 },
  { leafCount: 1 },
])("does not mark an empty or unknown show as watched: %j", (counts) => {
  expect(isMediaWatched({ type: "show", ...counts })).toBe(false);
});

it.each(["movie", "episode"] as const)("updates a %s without mutating its metadata or other fields", (type) => {
  const original = Object.freeze({
    type, viewCount: 3, title: "Title", viewOffset: 500, leafCount: 8,
    viewedLeafCount: 4, Media: [{ id: "version" }],
  });
  const unwatched = applyMediaWatchedState(original, false);
  const watched = applyMediaWatchedState(unwatched, true);

  expect(unwatched).toEqual({ ...original, viewCount: 0 });
  expect(watched).toEqual({ ...original, viewCount: 1 });
  expect(unwatched).not.toBe(original);
  expect(watched.Media).toBe(original.Media);
  expect(original.viewCount).toBe(3);
  expect(isMediaWatched(unwatched)).toBe(false);
  expect(isMediaWatched(watched)).toBe(true);
});

it("updates a show's episode count while preserving its independent view count", () => {
  const original = Object.freeze({ type: "show", leafCount: 8, viewedLeafCount: 4, viewCount: 7 });
  const watched = applyMediaWatchedState(original, true);
  const unwatched = applyMediaWatchedState(watched, false);

  expect(watched).toEqual({ ...original, viewedLeafCount: 8 });
  expect(unwatched).toEqual({ ...original, viewedLeafCount: 0 });
  expect(original.viewedLeafCount).toBe(4);
  expect(isMediaWatched(watched)).toBe(true);
  expect(isMediaWatched(unwatched)).toBe(false);
});

it("does not invent episodes when marking a show whose size is unknown", () => {
  const watched = applyMediaWatchedState({ type: "show" }, true);
  expect(watched).toEqual({ type: "show", viewedLeafCount: undefined });
  expect(isMediaWatched(watched)).toBe(false);
});

it("uses the same transformation for slim library cards and full Plex metadata", () => {
  const card: LibraryCardDto = { ratingKey: "1", guid: "plex://movie/1", type: "movie", title: "Movie" };
  const full = { ...card, summary: "Full metadata", Field: [{ name: "title", locked: true }] } as Plex.Metadata;

  expect(applyMediaWatchedState(card, true).viewCount).toBe(1);
  const updated = applyMediaWatchedState(full, true);
  expect(updated.viewCount).toBe(1);
  expect(updated.Field).toBe(full.Field);
  expect(updated.summary).toBe("Full metadata");
});
