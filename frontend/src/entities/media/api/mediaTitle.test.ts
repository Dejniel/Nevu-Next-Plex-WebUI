import { readDiscoverTitle } from "./mediaTitle";

it("projects local copies to the same Discover identity without their server state", () => {
  const item = {
    type: "movie",
    guid: "plex://movie/discover-id",
    title: "Film",
    ratingKey: "123",
    librarySectionID: 4,
    key: "/library/metadata/123",
    thumb: "/poster",
    userRating: 8,
    viewCount: 2,
    viewOffset: 1000,
    Media: [{ Part: [{ key: "/library/parts/123/file.mkv" }] }],
    Rating: [{ type: "critic", value: 8.5, image: "imdb://image" }],
    Genre: [{ tag: "Drama" }],
  };
  const result = readDiscoverTitle(item);
  expect(result).toMatchObject({
    ratingKey: "discover-id",
    guid: item.guid,
    type: "movie",
    title: "Film",
    thumb: "/poster",
    Genre: item.Genre,
    Rating: item.Rating,
  });
  for (const key of [
    "librarySectionID",
    "key",
    "userRating",
    "viewCount",
    "viewOffset",
    "Media",
  ])
    expect(result).not.toHaveProperty(key);
  expect(
    readDiscoverTitle({ ...item, ratingKey: "456", librarySectionID: 5 }),
  ).toEqual(result);
});

it("checks only the Discover title contract rather than expecting server playback metadata", () => {
  expect(
    readDiscoverTitle({
      type: "show",
      guid: "plex://show/id",
      ratingKey: "id",
      title: "Show",
      Media: "provider-owned",
      librarySectionID: "provider-owned",
      seasonCount: 2,
    }),
  ).toEqual({
    type: "show",
    guid: "plex://show/id",
    ratingKey: "id",
    title: "Show",
    seasonCount: 2,
  });
});

it.each([
  { Genre: {} },
  { Genre: [{ tag: 1 }] },
  { Rating: [{ value: "8" }] },
  { duration: -1 },
  { ratingKey: "" },
  { guid: "plex://show/show" },
])("rejects invalid title data %j", (invalid) => {
  expect(() =>
    readDiscoverTitle({
      type: "movie",
      guid: "plex://movie/id",
      ratingKey: "id",
      title: "Film",
      ...invalid,
    }),
  ).toThrow("invalid");
});
