import { titleActionOverflow } from "./titleActionOverflow";

const geometry = {
  width: 500,
  playWidth: 90,
  menuWidth: 38,
  gap: 8,
  actions: {
    watchlist: 64,
    watched: 38,
    rating: 38,
    download: 38,
    edit: 38,
    match: 38,
  },
  hasMenuActions: true,
};

it("keeps all available actions when their measured widths fit", () => {
  expect(titleActionOverflow(geometry)).toEqual([]);
  expect(titleActionOverflow({ ...geometry, width: 438 })).toEqual([]);
});

it("moves the least important actions first and reserves space for Play and the menu", () => {
  expect(titleActionOverflow({ ...geometry, width: 437 })).toEqual(["match"]);
  expect(titleActionOverflow({ ...geometry, width: 300 })).toEqual([
    "match",
    "edit",
    "download",
  ]);
  expect(titleActionOverflow({ ...geometry, width: 180 })).toEqual([
    "match",
    "edit",
    "download",
    "rating",
    "watched",
    "watchlist",
  ]);
});

it("responds to action width and gap changes, including longer Play labels and larger fonts", () => {
  expect(titleActionOverflow({ ...geometry, playWidth: 155 })).toEqual([
    "match",
  ]);
  expect(titleActionOverflow({ ...geometry, gap: 24 })).toEqual(["match"]);
  expect(
    titleActionOverflow({
      ...geometry,
      width: 438,
      actions: { ...geometry.actions, watchlist: 80 },
    }),
  ).toEqual(["match"]);
});

it("ignores unavailable actions and adds a menu only when needed", () => {
  const smaller = {
    ...geometry,
    hasMenuActions: false,
    actions: { watched: 38, rating: 38, download: 0 },
  };
  expect(titleActionOverflow({ ...smaller, width: 182 })).toEqual([]);
  expect(titleActionOverflow({ ...smaller, width: 181 })).toEqual([
    "rating",
    "watched",
  ]);
  expect(titleActionOverflow({ ...smaller, width: 200 })).toEqual([]);
});
