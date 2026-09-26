import { hasPlexFeature } from "./serverCapabilities";

it("finds a nested Plex server capability", () => {
  expect(
    hasPlexFeature(
      { MediaContainer: { MediaProvider: [{ Feature: [{ type: "manage" }] }] } },
      "manage",
    ),
  ).toBe(true);
});

it("does not infer management access from unrelated capabilities", () => {
  expect(hasPlexFeature({ Feature: [{ type: "content" }] }, "manage")).toBe(false);
  expect(hasPlexFeature(null, "manage")).toBe(false);
});
