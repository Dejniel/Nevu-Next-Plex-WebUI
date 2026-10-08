import {
  DEFAULT_LIBRARY_SORT,
  normalizeLibrarySort,
} from "./LibrarySortDropDown";
import {
  defaultLibrarySort,
  librarySortOptions,
} from "../model/librarySort";

describe("normalizeLibrarySort", () => {
  it("keeps supported sort values", () => {
    expect(normalizeLibrarySort("addedAt:desc")).toBe("addedAt:desc");
  });

  it("uses the default when storage is empty or stale", () => {
    expect(normalizeLibrarySort(null)).toBe(DEFAULT_LIBRARY_SORT);
    expect(normalizeLibrarySort("titleSort:asc&token=bad")).toBe(DEFAULT_LIBRARY_SORT);
  });
});

describe("Plex library sort capabilities", () => {
  const sorts: Plex.Sort[] = [
    {
      key: "titleSort",
      descKey: "titleSort:desc",
      title: "Title",
      default: "asc",
      defaultDirection: "asc",
    },
    {
      key: "audienceRating",
      descKey: "audienceRating:desc",
      title: "Audience Rating",
    },
    { key: "random", descKey: "random:desc", title: "Randomly" },
  ];

  it("creates both directions from API data and keeps random singular", () => {
    expect(librarySortOptions(sorts)).toEqual([
      { value: "titleSort", label: "Title (A-Z)", random: false },
      { value: "titleSort:desc", label: "Title (Z-A)", random: false },
      { value: "audienceRating", label: "Audience Rating (Lowest)", random: false },
      { value: "audienceRating:desc", label: "Audience Rating (Highest)", random: false },
      { value: "random:desc", label: "Random", random: true },
    ]);
  });

  it("uses the default declared by Plex", () => {
    expect(defaultLibrarySort(sorts)).toBe("titleSort");
  });

  it("distinguishes the default sort from each field's preferred direction", () => {
    const name = {
      key: "photo.titleSort,photo.originallyAvailableAt,photo.id",
      descKey: "photo.titleSort:desc,photo.originallyAvailableAt,photo.id",
      title: "Name",
      default: "asc",
      defaultDirection: "asc",
    };
    const photoSorts: Plex.Sort[] = [
      {
        key: "addedAt",
        descKey: "addedAt:desc",
        title: "Date Added",
        defaultDirection: "desc",
      },
      {
        key: "originallyAvailableAt",
        descKey: "originallyAvailableAt:desc",
        title: "Date Taken",
        defaultDirection: "desc",
      },
      name,
    ];
    expect(defaultLibrarySort(photoSorts)).toBe(name.key);
    expect(
      librarySortOptions(photoSorts)
        .slice(-2)
        .map((option) => option.label),
    ).toEqual(["Name (A-Z)", "Name (Z-A)"]);
  });

  it("does not advertise undeclared Plex sorts in the fallback", () => {
    expect(librarySortOptions()).toEqual([
      { value: "titleSort", label: "Title (A-Z)", random: false },
      { value: "titleSort:desc", label: "Title (Z-A)", random: false },
      { value: "random:desc", label: "Random", random: true },
    ]);
  });
});
