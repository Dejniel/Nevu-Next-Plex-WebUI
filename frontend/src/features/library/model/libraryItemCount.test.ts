import { formatLibraryItemCount } from "./libraryItemCount";

it("uses Plex totalSize instead of the loaded page size", () => {
  expect(formatLibraryItemCount({ size: 50, totalSize: 248 })).toBe("248");
});

it("falls back to size when Plex omits totalSize", () => {
  expect(formatLibraryItemCount({ size: 12 })).toBe("12");
});

it("returns nothing while no response is available", () => {
  expect(formatLibraryItemCount(null)).toBeNull();
});
