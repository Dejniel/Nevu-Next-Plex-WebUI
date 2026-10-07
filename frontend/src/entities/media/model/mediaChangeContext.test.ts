import { mediaChangeContext } from "./mediaChangeContext";

it("finds episode relationships and section from cached response projections", () => {
  expect(mediaChangeContext([{
    ratingKey: "101", type: "episode", parentRatingKey: "100", grandparentRatingKey: "99", librarySectionID: 1,
  }], "101")).toEqual({ found: true, parentIds: ["100", "99"], parentScopeUnknown: false, sectionId: "1" });
});

it("follows cached season relationships and nested Children/OnDeck without requiring full child metadata", () => {
  expect(mediaChangeContext([
    { ratingKey: "101", type: "episode", parentRatingKey: "100" },
    { ratingKey: "100", type: "season", parentRatingKey: "99" },
  ], "101").parentIds).toEqual(["100", "99"]);
  const show = {
    ratingKey: "99", type: "show",
    Children: { Metadata: [{ ratingKey: "100", type: "season" }] },
    OnDeck: { Metadata: { ratingKey: "101", type: "episode", parentRatingKey: "100", grandparentRatingKey: "99" } },
  } as Plex.Metadata;
  expect(mediaChangeContext([show], "100").parentIds).toEqual(["99"]);
  expect(mediaChangeContext([show], "101")).toMatchObject({ parentIds: ["99", "100"], parentScopeUnknown: false });
});

it("keeps unknown relationships conservative, without mistaking two season IDs for a complete ancestry", () => {
  expect(mediaChangeContext([], "101").parentScopeUnknown).toBe(true);
  expect(mediaChangeContext([
    { ratingKey: "101", type: "episode", parentRatingKey: "100" },
    { ratingKey: "101", type: "episode", parentRatingKey: "200" },
  ], "101").parentScopeUnknown).toBe(true);
  expect(mediaChangeContext([
    { ratingKey: "101", type: "episode", parentRatingKey: "100" },
    { ratingKey: "101", type: "episode", parentRatingKey: "200", grandparentRatingKey: "199" },
  ], "101").parentScopeUnknown).toBe(true);
  expect(mediaChangeContext([{ ratingKey: "1", type: "movie" }], "1"))
    .toMatchObject({ parentIds: [], parentScopeUnknown: false });
});

it("follows music and photo ancestry using the same cached relationship model", () => {
  expect(mediaChangeContext([
    { ratingKey: "30", type: "track", parentRatingKey: "20", librarySectionID: 3 },
    { ratingKey: "20", type: "album", parentRatingKey: "10" },
  ], "30")).toMatchObject({ parentIds: ["20", "10"], parentScopeUnknown: false, sectionId: "3" });
  expect(mediaChangeContext([{ ratingKey: "50", type: "photo", parentRatingKey: "40", librarySectionID: 4 }], "50"))
    .toMatchObject({ parentIds: ["40"], parentScopeUnknown: false, sectionId: "4" });
  expect(mediaChangeContext([{ ratingKey: "30", type: "track" }], "30").parentScopeUnknown).toBe(true);
});
