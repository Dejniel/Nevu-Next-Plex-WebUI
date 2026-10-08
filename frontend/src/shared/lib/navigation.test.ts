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

test("keeps Watchlist filters when opening details and switching library views", () => {
  const current = { pathname: "/browse/2", search: "?view=watchlist&wlScope=all&wlSearch=Alien&sort=titleSort%3Aasc" };
  const details = mediaDetailsTo(current, { ratingKey: "42", guid: "plex://movie/alien" });
  const params = new URLSearchParams(String(details.search));
  expect(params.get("wlScope")).toBe("all");
  expect(params.get("wlSearch")).toBe("Alien");
  expect(params.get("mid")).toBe("42");
  const browse = libraryViewTo(current, "browse");
  expect(new URLSearchParams(String(browse.search)).get("sort")).toBe("titleSort:asc");
  expect(new URLSearchParams(String(libraryViewTo(current, "watchlist").search)).get("view")).toBe("watchlist");
});

it("opens catalog pages independently of video dialogs and preserves the library identity", async () => {
  const { catalogItemTo } = await import("./navigation");
  const location = { pathname: "/browse/3", search: "?type=album&sort=year:desc&genre=rock" };
  expect(catalogItemTo(location, { ratingKey: "300", type: "album" })).toEqual({ pathname: "/browse/3/item/300" });
  expect(catalogItemTo(location, { ratingKey: "401", type: "track", grandparentRatingKey: "200" })).toEqual({ pathname: "/browse/3/item/200" });
  expect(catalogItemTo(location, { ratingKey: "300", type: "photo" })).toBeNull();
});

it("retains photo filters but resets view-specific sorting and preview identity", () => {
  const filter = JSON.stringify(["make", "=", "Canon"]);
  const current = {
    pathname: "/browse/5",
    search: `?view=browse&type=photo&sort=photo.titleSort&filter=${encodeURIComponent(filter)}&photo=54&photoIndex=0`,
  };
  const all = libraryViewTo(current, "photos");
  const params = new URLSearchParams(String(all.search));
  expect(params.get("view")).toBe("photos");
  expect(params.get("filter")).toBe(filter);
  for (const key of ["sort", "type", "photo", "photoIndex"])
    expect(params.has(key)).toBe(false);
  const back = libraryViewTo(
    { ...current, search: `${all.search}&sort=originallyAvailableAt:desc` },
    "browse",
  );
  expect(new URLSearchParams(String(back.search)).has("sort")).toBe(false);
});
