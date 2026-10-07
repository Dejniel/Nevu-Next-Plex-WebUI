import { isLibraryItemType } from "@nevu/contracts";
import { isBrowsableLibraryType, libraryViews } from "./libraryBrowsing";

it.each(["movie", "show"])("keeps video views available for %s", type => {
  expect(isBrowsableLibraryType(type)).toBe(true);
  expect(libraryViews(type)).toEqual(["recommendations", "browse", "watchlist", "collections", "playlists"]);
});

it.each(["artist", "photo"])("exposes catalog browsing for %s libraries", type => {
  expect(isBrowsableLibraryType(type)).toBe(true);
  expect(libraryViews(type)).toEqual(["browse"]);
});

it("separates supported media items from root libraries and rejects unknown types", () => {
  for (const type of ["artist", "album", "track", "photoalbum", "photo"])
    expect(isLibraryItemType(type)).toBe(true);
  for (const type of ["constructor", "__proto__", "directory", "unsupported", null])
    expect(isLibraryItemType(type)).toBe(false);
  expect(isBrowsableLibraryType("album")).toBe(false);
});
