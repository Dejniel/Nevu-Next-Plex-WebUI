import {
  getLibraryRandomSeed,
  libraryRandomSeedKey,
  replaceLibraryRandomSeed,
} from "./libraryRandom";

beforeEach(() => localStorage.clear());

it("persists one seed across filters for a profile and library", () => {
  const first = getLibraryRandomSeed("profile-1", 7);
  const second = getLibraryRandomSeed("profile-1", 7);

  expect(second).toBe(first);
  expect(localStorage.getItem(libraryRandomSeedKey("profile-1", 7))).toBe(first);
  expect(getLibraryRandomSeed("profile-2", 7)).not.toBe(first);
});

it("changes a seed only on an explicit replacement", () => {
  const first = getLibraryRandomSeed("profile-1", 7);
  const replacement = replaceLibraryRandomSeed("profile-1", 7);

  expect(replacement).not.toBe(first);
  expect(getLibraryRandomSeed("profile-1", 7)).toBe(replacement);
});
