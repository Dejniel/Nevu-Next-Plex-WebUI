import {
  photoAspectRatio,
  photoMonth,
  photoIndex,
  adjacentPhoto,
} from "./photos";
import type { LibraryEntryDto } from "@nevu/contracts";

it.each([null, "", "-1", "1.5", "Infinity", "9007199254740992", "1e3"])(
  "rejects invalid photo indexes (%s)",
  (value) => {
    expect(photoIndex(value)).toBeNull();
  },
);
it("reads zero and deep photo indexes", () => {
  expect(photoIndex("0")).toBe(0);
  expect(photoIndex("10000")).toBe(10000);
});
const photo = (id: string): LibraryEntryDto => ({
  type: "photo",
  ratingKey: id,
  title: id,
});
it("skips loaded clips and albums while following the catalog order", () => {
  const items = new Map<number, LibraryEntryDto>([
    [9, photo("previous")],
    [10, photo("current")],
    [11, { type: "clip", ratingKey: "clip", title: "Clip" }],
    [12, photo("next")],
  ]);
  expect(adjacentPhoto(items, "current", 10, -1)?.[0]).toBe(9);
  expect(adjacentPhoto(items, "current", 10, 1)?.[0]).toBe(12);
});
it("does not jump from a deep position to a distant cached page", () => {
  const items = new Map([
    [0, photo("first")],
    [10000, photo("current")],
  ]);
  expect(adjacentPhoto(items, "current", 10000, -1)).toBeUndefined();
  items.set(9999, photo("previous"));
  expect(adjacentPhoto(items, "current", 10000, -1)?.[0]).toBe(9999);
});
it("does not use an index that belongs to a different photo after reordering", () => {
  const items = new Map([
    [0, photo("one")],
    [1, photo("two")],
  ]);
  expect(adjacentPhoto(items, "two", 0, 1)).toBeUndefined();
});

it("keeps portrait and landscape proportions and tolerates missing dimensions", () => {
  const photo = {
    ratingKey: "1",
    type: "photo" as const,
    title: "Photo",
    Media: [{ width: 1000, height: 2000 }],
  };
  expect(photoAspectRatio(photo)).toBe(0.5);
  expect(
    photoAspectRatio({ ...photo, Media: [{ width: 2000, height: 1000 }] }),
  ).toBe(2);
  expect(photoAspectRatio(undefined)).toBe(1.5);
});
it("uses the photo date for month groups, with an explicit undated group", () => {
  expect(
    photoMonth({
      ratingKey: "1",
      type: "photo",
      title: "P",
      originallyAvailableAt: "2026-10-01",
    }),
  ).toContain("2026");
  expect(photoMonth({ ratingKey: "1", type: "photo", title: "P" })).toBe(
    "Undated",
  );
});
