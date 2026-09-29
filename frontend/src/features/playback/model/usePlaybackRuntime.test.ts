import { parseStoredVolume } from "./usePlaybackRuntime";

it("restores and clamps the stored volume", () => {
  expect(parseStoredVolume("60")).toBe(60);
  expect(parseStoredVolume("150")).toBe(100);
  expect(parseStoredVolume("-10")).toBe(0);
  expect(parseStoredVolume("invalid")).toBe(100);
  expect(parseStoredVolume(null)).toBe(100);
});
