import {
  LIBRARY_NAVIGATION_SETTING,
  isLibraryRouteActive,
  normalizeLibraryNavigation,
  parseLibraryNavigation,
  serializeLibraryNavigation,
} from "./navigation";

const libraries = [
  { key: "1", uuid: "movies", title: "Movies", type: "movie" as const },
  { key: "2", uuid: "shows", title: "Shows", type: "show" as const },
  { key: "3", uuid: "anime", title: "Anime", type: "show" as const },
];

it("matches only the selected library route", () => {
  expect(isLibraryRouteActive("/browse/1", "1")).toBe(true);
  expect(isLibraryRouteActive("/browse/1/recommended", "1")).toBe(true);
  expect(isLibraryRouteActive("/browse/10", "1")).toBe(false);
  expect(isLibraryRouteActive("/browse/1-other", "1")).toBe(false);
});

it("migrates legacy visibility settings to pinned libraries", () => {
  const result = normalizeLibraryNavigation(libraries, {
    LIBRARY_shows: "false",
  });

  expect(result.pinned.map((library) => library.uuid)).toEqual(["movies", "anime"]);
  expect(result.unpinned.map((library) => library.uuid)).toEqual(["shows"]);
});

it("keeps a saved order and pins newly discovered libraries", () => {
  const saved = serializeLibraryNavigation({
    order: ["shows", "movies"],
    pinned: ["movies"],
  });
  const result = normalizeLibraryNavigation(libraries, {
    [LIBRARY_NAVIGATION_SETTING]: saved,
  });

  expect(result.ordered.map((library) => library.uuid)).toEqual([
    "shows",
    "movies",
    "anime",
  ]);
  expect(result.preference.pinned).toEqual(["movies", "anime"]);
});

it("rejects malformed settings and serializes unique identifiers", () => {
  expect(parseLibraryNavigation("nope")).toBeNull();
  expect(
    serializeLibraryNavigation({ order: ["movies", "movies"], pinned: ["movies"] }),
  ).toBe('{"order":["movies"],"pinned":["movies"]}');
});
