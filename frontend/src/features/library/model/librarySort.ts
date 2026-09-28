import type { LibrarySort } from "@nevu/contracts";

export const DEFAULT_LIBRARY_SORT: LibrarySort = "titleSort";

const SORT_EXPRESSION = /^[A-Za-z][A-Za-z0-9_.]*(?::(?:asc|desc|nullsFirst|nullsLast))?(?:,[A-Za-z][A-Za-z0-9_.]*(?::(?:asc|desc|nullsFirst|nullsLast))?)*$/;

const FALLBACK_SORTS: Plex.Sort[] = [
  { key: "titleSort", descKey: "titleSort:desc", title: "Title", default: "asc" },
  { key: "random", descKey: "random:desc", title: "Randomly" },
];

export interface LibrarySortOption {
  value: LibrarySort;
  label: string;
  random: boolean;
}

export function isValidLibrarySort(value: string | null | undefined): value is LibrarySort {
  return Boolean(value && value.length <= 512 && SORT_EXPRESSION.test(value));
}

export function normalizeLibrarySort(value: string | null): LibrarySort {
  return isValidLibrarySort(value) ? value : DEFAULT_LIBRARY_SORT;
}

export function isRandomLibrarySort(value: LibrarySort) {
  return value === "random" || value === "random:desc";
}

function directionLabels(title: string): [string, string] {
  const normalized = title.toLowerCase();
  if (normalized === "title" || normalized.includes("artist") || normalized === "show")
    return ["A-Z", "Z-A"];
  if (normalized.includes("date")) return ["Oldest", "Newest"];
  if (normalized === "duration") return ["Shortest", "Longest"];
  if (normalized === "unwatched" || normalized === "plays") return ["Fewest", "Most"];
  if (
    normalized.includes("rating") ||
    normalized === "resolution" ||
    normalized === "bitrate" ||
    normalized === "popularity"
  ) return ["Lowest", "Highest"];
  return ["Ascending", "Descending"];
}

function optionsFromSorts(sorts: Plex.Sort[]): LibrarySortOption[] {
  return sorts.flatMap((sort) => {
    if (!isValidLibrarySort(sort.key) || !isValidLibrarySort(sort.descKey)) return [];
    if (isRandomLibrarySort(sort.key) || isRandomLibrarySort(sort.descKey))
      return [{ value: sort.descKey, label: "Random", random: true }];

    const [ascending, descending] = directionLabels(sort.title);
    return [
      { value: sort.key, label: `${sort.title} (${ascending})`, random: false },
      { value: sort.descKey, label: `${sort.title} (${descending})`, random: false },
    ];
  });
}

export function librarySortOptions(sorts?: Plex.Sort[]): LibrarySortOption[] {
  if (!sorts?.length) return optionsFromSorts(FALLBACK_SORTS);
  const options = optionsFromSorts(sorts);
  return options.length ? options : optionsFromSorts(FALLBACK_SORTS);
}

export function defaultLibrarySort(sorts?: Plex.Sort[]): LibrarySort {
  const source = sorts?.length ? sorts : FALLBACK_SORTS;
  const declared = source.find((sort) => sort.default || sort.defaultDirection);
  if (!declared) return librarySortOptions(source)[0]?.value || DEFAULT_LIBRARY_SORT;
  const direction = declared.defaultDirection || declared.default;
  return direction === "desc" && isValidLibrarySort(declared.descKey)
    ? declared.descKey
    : normalizeLibrarySort(declared.key);
}
