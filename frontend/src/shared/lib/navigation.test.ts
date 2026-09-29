import {
  libraryBrowseTo,
  libraryViewTo,
  mediaDetailsTo,
  mediaWatchTo,
  recommendationShelfTo,
} from "./navigation";

const location = {
  pathname: "/browse/1",
  search: "?view=browse&sort=titleSort%3Aasc&bkey=old&bprops=%7B%7D",
  hash: "",
};

test("builds a details link without discarding the current library state", () => {
  expect(
    mediaDetailsTo(location, { ratingKey: "42", type: "movie" })
  ).toEqual({
    pathname: "/browse/1",
    search: "?view=browse&sort=titleSort%3Aasc&mid=42",
    hash: "",
  });
});

test("opens an episode at its show's details", () => {
  const target = mediaDetailsTo(location, {
    ratingKey: "episode-1",
    grandparentRatingKey: "show-1",
    type: "episode",
  });

  expect(new URLSearchParams(String(target.search)).get("mid")).toBe("show-1");
});

test("can address an exact item and a specific details tab", () => {
  const target = mediaDetailsTo(
    location,
    {
      ratingKey: "episode-1",
      grandparentRatingKey: "show-1",
      type: "episode",
    },
    false,
    { exactItem: true, tab: "media" },
  );
  const params = new URLSearchParams(String(target.search));

  expect(params.get("mid")).toBe("episode-1");
  expect(params.get("detailsTab")).toBe("media");
});

test("keeps a Plex.tv item addressable until its guid is resolved", () => {
  const target = mediaDetailsTo(
    location,
    { ratingKey: "remote", guid: "plex://movie/abc" },
    true
  );
  const params = new URLSearchParams(String(target.search));

  expect(params.get("pguid")).toBe("plex://movie/abc");
  expect(params.has("mid")).toBe(false);
});

test("builds browse links and removes all open details state", () => {
  const target = libraryBrowseTo(
    { ...location, search: "?view=browse&mid=42&detailsTab=details" },
    "/library/sections/1/all",
    { title: "Movies" }
  );
  const params = new URLSearchParams(String(target.search));

  expect(params.get("view")).toBe("browse");
  expect(params.has("mid")).toBe(false);
  expect(params.has("detailsTab")).toBe(false);
  expect(params.get("bkey")).toBe("/library/sections/1/all");
  expect(JSON.parse(params.get("bprops") || "{}")).toEqual({ title: "Movies" });
});

test("includes a resume offset in watch links", () => {
  expect(mediaWatchTo({ ratingKey: "42", viewOffset: 1234 })).toBe(
    "/watch/42?t=1234"
  );
});

test("makes library views and recommendation shelves addressable", () => {
  const browse = libraryViewTo(location, "browse");
  expect(new URLSearchParams(String(browse.search)).get("view")).toBe("browse");

  const shelf = recommendationShelfTo(location, "recently-added");
  const shelfParams = new URLSearchParams(String(shelf.search));
  expect(shelfParams.get("view")).toBe("recommendations");
  expect(shelfParams.get("shelf")).toBe("recently-added");
});
