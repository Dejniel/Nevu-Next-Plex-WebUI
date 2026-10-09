import {
  isMediaInLibrary,
  type MediaAvailability,
  type DiscoverTitle,
} from "entities/media/model";

export type WatchlistSort = "added" | "title" | "year";

export function selectWatchlistItems(
  items: readonly DiscoverTitle[],
  availability: ReadonlyMap<string, MediaAvailability>,
  options: { libraryID?: string; search: string; sort: WatchlistSort },
) {
  const search = options.search.trim().toLocaleLowerCase();
  const selected = items.filter(
    (item) =>
      (!options.libraryID ||
        isMediaInLibrary(item.guid, availability, options.libraryID)) &&
      (!search || item.title.toLocaleLowerCase().includes(search)),
  );
  if (options.sort === "title")
    selected.sort((a, b) =>
      a.title.localeCompare(b.title, undefined, { numeric: true }),
    );
  if (options.sort === "year")
    selected.sort(
      (a, b) => (b.year ?? 0) - (a.year ?? 0) || a.title.localeCompare(b.title),
    );
  return selected;
}
