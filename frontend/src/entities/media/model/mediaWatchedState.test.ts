import { isMediaWatched } from "./mediaWatchedState";

it.each(["movie", "episode"] as const)(
  "recognizes the view count of a %s",
  (type) => {
    expect(isMediaWatched({ type })).toBe(false);
    expect(isMediaWatched({ type, viewCount: 0 })).toBe(false);
    expect(isMediaWatched({ type, viewCount: 2 })).toBe(true);
    expect(isMediaWatched({ type, viewCount: -1 })).toBe(false);
  },
);

it("requires all known episodes to be watched before marking a show watched", () => {
  expect(
    isMediaWatched({ type: "show", leafCount: 5, viewedLeafCount: 5 }),
  ).toBe(true);
  expect(
    isMediaWatched({ type: "show", leafCount: 5, viewedLeafCount: 4 }),
  ).toBe(false);
  expect(isMediaWatched({ type: "show", leafCount: 5, viewCount: 1 })).toBe(
    false,
  );
});

it.each([
  {},
  { leafCount: 0, viewedLeafCount: 0 },
  { viewedLeafCount: 1 },
  { leafCount: 1 },
])("does not mark an empty or unknown show as watched: %j", (counts) => {
  expect(isMediaWatched({ type: "show", ...counts })).toBe(false);
});

it.each(["track", "photo"])(
  "does not treat %s play counts as watched video",
  (type) => {
    const item = Object.freeze({ type, viewCount: 5 });
    expect(isMediaWatched(item)).toBe(false);
  },
);
