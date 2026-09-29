import {
  isMatchedMetadata,
  matchActionLabel,
  matchSourceLabel,
  normalizeMatchCandidates,
} from "./matching";

it("distinguishes local unmatched items from provider matches", () => {
  expect(isMatchedMetadata({ guid: "local://123" })).toBe(false);
  expect(matchActionLabel({ guid: "local://123" })).toBe("Match");
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
