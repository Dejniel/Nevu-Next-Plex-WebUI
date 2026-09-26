import { hasHeroArtwork, pickHeroCandidate } from "./homeHero";

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

it("picks only items that have hero artwork", () => {
  expect(pickHeroCandidate(candidates, () => 0)?.ratingKey).toBe("first");
  expect(pickHeroCandidate(candidates, () => 0.99)?.ratingKey).toBe("second");
});

it("returns null when no item has hero artwork", () => {
  expect(pickHeroCandidate([{ art: "" }, {}])).toBeNull();
  expect(pickHeroCandidate([])).toBeNull();
  expect(pickHeroCandidate(undefined)).toBeNull();
});
