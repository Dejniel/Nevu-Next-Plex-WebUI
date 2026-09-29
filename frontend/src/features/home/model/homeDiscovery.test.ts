import {
  hasHeroArtwork,
  heroCandidates,
  randomLibraryWindow,
  shuffled,
} from "./homeDiscovery";

const candidates = [
  { ratingKey: "missing" },
  { ratingKey: "blank", art: "   " },
  { ratingKey: "first", art: "/library/metadata/1/art/1" },
  { ratingKey: "second", art: "/library/metadata/2/art/2" },
];

it("recognizes only non-empty hero artwork", () => {
  expect(hasHeroArtwork(null)).toBe(false);
  expect(hasHeroArtwork({})).toBe(false);
  expect(hasHeroArtwork({ art: " " })).toBe(false);
  expect(hasHeroArtwork({ art: "/art" })).toBe(true);
});

it("keeps only items that have hero artwork and preserves their order", () => {
  expect(heroCandidates(candidates).map((item) => item.ratingKey)).toEqual([
    "first",
    "second",
  ]);
});

it("returns an empty candidate list when no item has hero artwork", () => {
  expect(heroCandidates([{ art: "" }, {}])).toEqual([]);
  expect(heroCandidates(undefined)).toEqual([]);
});

it("creates an eight-item window from a random library offset", () => {
  expect(randomLibraryWindow(100, 8, () => 0.42)).toEqual({
    start: 42,
    size: 8,
    wrapSize: 0,
  });
});

it("wraps the window at the end and handles small or empty libraries", () => {
  expect(randomLibraryWindow(10, 8, () => 0.8)).toEqual({
    start: 8,
    size: 2,
    wrapSize: 6,
  });
  expect(randomLibraryWindow(3, 8, () => 0.67)).toEqual({
    start: 2,
    size: 1,
    wrapSize: 2,
  });
  expect(randomLibraryWindow(0)).toBeNull();
});

it("shuffles a copy without mutating the source", () => {
  const source = [1, 2, 3, 4];
  expect(shuffled(source, () => 0)).toEqual([2, 3, 4, 1]);
  expect(source).toEqual([1, 2, 3, 4]);
});
