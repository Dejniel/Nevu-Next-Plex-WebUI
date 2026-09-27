import {
  DEFAULT_LIBRARY_SORT,
  normalizeLibrarySort,
} from "./LibrarySortDropDown";

describe("normalizeLibrarySort", () => {
  it("keeps supported sort values", () => {
    expect(normalizeLibrarySort("addedAt:desc")).toBe("addedAt:desc");
  });

  it("uses the default when storage is empty or stale", () => {
    expect(normalizeLibrarySort(null)).toBe(DEFAULT_LIBRARY_SORT);
    expect(normalizeLibrarySort("titleSort:asc")).toBe(DEFAULT_LIBRARY_SORT);
  });
});
