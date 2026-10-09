import {
  isMatchedMetadata,
  matchActionLabel,
  matchSourceLabel,
  normalizeMatchCandidates,
  matchSearchTerm,
  metadataMatchCriteriaErrors,
  normalizeMatchAgents,
  metadataMatchType,
} from "./matching";

it("distinguishes local unmatched items from provider matches", () => {
  expect(isMatchedMetadata({ guid: "local://123" })).toBe(false);
  expect(matchActionLabel({ guid: "local://123" })).toBe("Match");
  expect(matchActionLabel({ guid: "tv.plex.agents.none://123" })).toBe("Match");
  expect(isMatchedMetadata({ guid: "plex://movie/123" })).toBe(true);
  expect(matchActionLabel({ guid: "plex://movie/123" })).toBe("Fix Match");
});

it("labels common metadata providers", () => {
  expect(matchSourceLabel("plex://movie/1")).toBe("Plex");
  expect(matchSourceLabel("tmdb://123")).toBe("TMDB");
});

it("accepts title as a fallback candidate name and drops malformed results", () => {
  expect(
    normalizeMatchCandidates([
      { guid: "plex://show/1", title: "Show", year: "bad" },
      null,
      { guid: "", name: "Bad" },
    ]),
  ).toEqual([{ guid: "plex://show/1", name: "Show", year: undefined }]);
});

it.each([
  ["tt1217209", "imdb-tt1217209"],
  ["IMDB://tt1217209", "imdb-tt1217209"],
  ["tmdb-10283", "tmdb-10283"],
  ["https://www.imdb.com/title/tt1217209/?ref_=x", "imdb-tt1217209"],
  ["https://www.themoviedb.org/movie/62177-brave", "tmdb-62177"],
  ["https://www.themoviedb.org/tv/10283", "tmdb-10283"],
  ["https://thetvdb.com/dereferrer/series/110381", "tvdb-110381"],
  [
    "mbid://67D2CB7A-9DDB-4A7F-82BF-5A2D1A038E98",
    "67d2cb7a-9ddb-4a7f-82bf-5a2d1a038e98",
  ],
  [
    "https://musicbrainz.org/release/a2743f6b-5096-416b-8001-fb08a64ec570",
    "a2743f6b-5096-416b-8001-fb08a64ec570",
  ],
])("normalizes the external identifier %s", (input, title) => {
  expect(matchSearchTerm(input)).toEqual({ title, identifier: true });
});
it.each([
  "",
  "imdb-title",
  "tvdb-abc",
  "mbid://invalid",
  "https://musicbrainz.org/artist/invalid",
  "https://musicbrainz.org/release-group/67d2cb7a-9ddb-4a7f-82bf-5a2d1a038e98",
  "https://example.org/title/tt1217209",
])("rejects malformed or unsupported identifier input %s", (input) =>
  expect(() => matchSearchTerm(input)).toThrow(),
);
it("preserves numeric movie titles and validates years only for a title search", () => {
  expect(matchSearchTerm(" 1917 ")).toEqual({
    title: "1917",
    identifier: false,
  });
  expect(
    metadataMatchCriteriaErrors({ title: "1917", year: 12 }),
  ).toHaveProperty("year");
  expect(
    metadataMatchCriteriaErrors({ title: "imdb-tt1217209", year: 12 }),
  ).toEqual({});
});
it("keeps primary agents advertised by PMS, excludes personal metadata and deduplicates them", () => {
  expect(
    normalizeMatchAgents([
      { identifier: "tv.plex.agents.movie", name: "Plex Movie" },
      { identifier: "tv.plex.agents.movie", name: "Plex Movie" },
      {
        identifier: "com.plexapp.agents.themoviedb",
        name: "TMDB",
        primary: true,
      },
      {
        identifier: "com.plexapp.agents.none",
        name: "Personal",
        primary: true,
      },
      { identifier: "tv.plex.agents.none", name: "Personal" },
      { identifier: "secondary", name: "Secondary", primary: false },
      null,
      {},
    ]),
  ).toEqual([
    { identifier: "tv.plex.agents.movie", name: "Plex Movie" },
    { identifier: "com.plexapp.agents.themoviedb", name: "TMDB" },
  ]);
});
it("retains album artist labels and identifies music matches", () => {
  const album = {
    guid: "mbid://release",
    name: "Kind of Blue",
    parentName: "Miles Davis",
    type: "album",
  };
  expect(normalizeMatchCandidates([album])).toEqual([album]);
  expect(matchSourceLabel(album.guid)).toBe("MusicBrainz");
  expect(isMatchedMetadata(album)).toBe(true);
});
it("supports native movie, show, artist and album matching only", () => {
  expect(
    [
      "movie",
      "show",
      "artist",
      "album",
      "episode",
      "track",
      "photo",
      "toString",
    ].map(metadataMatchType),
  ).toEqual([1, 2, 8, 9, undefined, undefined, undefined, undefined]);
});
