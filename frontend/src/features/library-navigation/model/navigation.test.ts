import {
  LIBRARY_NAVIGATION_SETTING,
  isLibraryRouteActive,
  libraryNavigationOverflow,
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

it("pins all libraries by default", () => {
  const result = normalizeLibraryNavigation(libraries, {});

  expect(result.pinned.map((library) => library.uuid)).toEqual([
    "movies",
    "shows",
    "anime",
  ]);
  expect(result.unpinned).toEqual([]);
  expect(result.preference.iconsOnly).toBe(false);
});

it("preserves icon mode when updating library pins and order", () => {
  const saved = serializeLibraryNavigation({
    order: ["shows", "movies", "anime"],
    pinned: ["movies"],
    iconsOnly: true,
  });
  const navigation = normalizeLibraryNavigation(libraries, {
    [LIBRARY_NAVIGATION_SETTING]: saved,
  });
  expect(
    parseLibraryNavigation(
      serializeLibraryNavigation({
        ...navigation.preference,
        pinned: ["shows"],
      }),
    ),
  ).toEqual({
    order: ["shows", "movies", "anime"],
    pinned: ["shows"],
    iconsOnly: true,
  });
});

describe("fitting library links", () => {
  const keys = ["1", "2", "3"];
  const geometry = {
    width: 320,
    gap: 10,
    items: { "1": 100, "2": 100, "3": 100, more: 70 },
  };

  it("uses the full width without reserving an unnecessary selector", () => {
    expect(libraryNavigationOverflow(geometry, keys, false)).toEqual([]);
    expect(
      libraryNavigationOverflow({ ...geometry, width: 319 }, keys, false),
    ).toEqual(["3"]);
  });

  it("reserves the selector whenever unpinned libraries exist", () => {
    expect(libraryNavigationOverflow(geometry, keys, true)).toEqual(["3"]);
    expect(
      libraryNavigationOverflow({ ...geometry, width: 400 }, keys, true),
    ).toEqual([]);
  });

  it("accounts for the selector and its gap when links start overflowing", () => {
    expect(
      libraryNavigationOverflow({ ...geometry, width: 290 }, keys, false),
    ).toEqual(["3"]);
    expect(
      libraryNavigationOverflow({ ...geometry, width: 289 }, keys, false),
    ).toEqual(["2", "3"]);
    expect(
      libraryNavigationOverflow({ ...geometry, width: 179 }, keys, false),
    ).toEqual(keys);
  });

  it("fits compact icons and preserves the selected pin order", () => {
    const compact = {
      ...geometry,
      width: 230,
      items: { "1": 40, "2": 40, "3": 40, more: 70 },
    };
    expect(libraryNavigationOverflow(compact, ["3", "1", "2"], true)).toEqual(
      [],
    );
    expect(
      libraryNavigationOverflow(
        { ...compact, width: 180 },
        ["3", "1", "2"],
        true,
      ),
    ).toEqual(["2"]);
  });

  it("handles no pinned links", () => {
    expect(libraryNavigationOverflow(geometry, [], true)).toEqual([]);
  });
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
    serializeLibraryNavigation({
      order: ["movies", "movies"],
      pinned: ["movies"],
    }),
  ).toBe('{"order":["movies"],"pinned":["movies"]}');
});
