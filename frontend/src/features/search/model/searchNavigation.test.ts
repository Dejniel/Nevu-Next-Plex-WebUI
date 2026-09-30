import { searchResultTo } from "./searchNavigation";

const location = {
  pathname: "/browse/1",
  search: "?view=browse&sort=titleSort%3Aasc",
};

it("opens media search results without losing library state", () => {
  const target = searchResultTo(location, {
    Metadata: { ratingKey: "42", type: "movie" },
  } as Plex.SearchResult);

  expect(new URLSearchParams(String(target && target.search)).get("mid")).toBe(
    "42",
  );
});

it("opens directory results through the library browser", () => {
  const target = searchResultTo(location, {
    score: 1,
    Directory: {
      key: "/library/sections/3/genre/7",
      title: "Drama",
      librarySectionID: 3,
      id: 7,
    },
  });
  const params = new URLSearchParams(String(target && target.search));

  expect(params.get("bkey")).toBe("/library/sections/3/genre/7");
});

it("rejects unsupported empty results", () => {
  expect(searchResultTo(location, { score: 0 })).toBeNull();
});
