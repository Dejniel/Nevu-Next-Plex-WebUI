import {
  type MediaMetadata,
  indexMediaAvailability,
  selectLocalMedia,
} from "entities/media/model";
import { selectWatchlistItems } from "./watchlistBrowse";

const movie = (guid: string, title: string, year = 2020) =>
  ({ guid, title, year }) as MediaMetadata;
const items = [
  movie("one", "Zoo", 2024),
  movie("two", "Alpha"),
  movie("three", "Remote"),
];
const local = (guid: string, ratingKey: string, librarySectionID: number) =>
  ({ guid, ratingKey, librarySectionID }) as MediaMetadata;
const copies = [
  local("one", "10", 1),
  local("one", "20", 2),
  local("two", "30", 2),
];
const availability = indexMediaAvailability([...copies, copies[0]]);

it("filters by actual library membership and keeps unavailable titles in the full list", () => {
  expect(
    selectWatchlistItems(items, availability, {
      libraryID: "1",
      search: "",
      sort: "added",
    }),
  ).toEqual([items[0]]);
  expect(
    selectWatchlistItems(items, availability, {
      libraryID: "2",
      search: "",
      sort: "added",
    }),
  ).toEqual(items.slice(0, 2));
  expect(
    selectWatchlistItems(items, availability, { search: "", sort: "added" }),
  ).toEqual(items);
});

it("chooses the copy in the current library without losing other copies", () => {
  expect(availability.get("one")?.localItems).toHaveLength(2);
  expect(selectLocalMedia(items[0], availability, "2")?.ratingKey).toBe("20");
  expect(selectLocalMedia(items[0], availability)?.ratingKey).toBe("10");
  expect(selectLocalMedia(items[2], availability)).toBeNull();
});

it("searches and sorts without changing the account's Watchlist order", () => {
  expect(
    selectWatchlistItems(items, availability, {
      search: " ALP ",
      sort: "title",
    }),
  ).toEqual([items[1]]);
  expect(
    selectWatchlistItems(items, availability, { search: "", sort: "title" }),
  ).toEqual([items[1], items[2], items[0]]);
  expect(
    selectWatchlistItems(items, availability, { search: "", sort: "year" })[0],
  ).toBe(items[0]);
  expect(items[0].title).toBe("Zoo");
});
