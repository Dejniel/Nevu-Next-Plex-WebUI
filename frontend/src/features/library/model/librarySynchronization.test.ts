import type { LibraryFilterExpression } from "@nevu/contracts";
import type { MediaChange } from "entities/media/model";
import { libraryPageQueryKey, libraryResultQueryKey, type LibraryQuery } from "./libraryQuery";
import { decideLibrarySynchronization } from "./librarySynchronization";

const query: LibraryQuery = { profileKey: "owner", sectionId: 2, sort: "titleSort", type: "movie" };
const change = (fields: readonly string[]): Extract<MediaChange, { effect: "metadata" }> => ({
  serverId: "server",
  profileKey: "owner",
  sectionId: "2",
  kind: "item",
  effect: "metadata",
  id: "101",
  fields,
});
const decide = (event: MediaChange, overrides: Partial<LibraryQuery> = {}) =>
  decideLibrarySynchronization("server", { ...query, ...overrides }, event);

it.each(["artist", "album", "photoalbum"] as const)("revalidates %s aggregates after a child changes", type => {
  expect(decide({ ...change(["thumb"]), parentIds: ["20"] }, { type })).toBe("refresh");
});

it.each(["track", "photo"] as const)("patches %s artwork in an unaffected title-sorted result", type => {
  expect(decide({ ...change(["thumb"]), parentIds: ["20"] }, { type })).toBe("patch");
});

it.each([
  ["summary", "titleSort", "patch"],
  ["title", "titleSort", "refresh"],
  ["thumb", "random:desc", "patch"],
  ["updatedAt", "updated:desc", "refresh"],
  ["year", "year:desc,titleSort:asc", "refresh"],
  ["summary", "futureField:asc", "refresh"],
  ["summary", "constructor:asc", "refresh"],
  ["type", "random", "refresh"],
  ["librarySectionID", "titleSort", "refresh"],
  ["Collection", "titleSort", "refresh"],
] as const)(
  "decides %s changes under %s sorting without evaluating Plex predicates",
  (field, sort, expected) => {
    expect(decide(change([field]), { sort })).toBe(expected);
  },
);

it("considers nested filters and unknown fields even when an item is not loaded", () => {
  const filterExpression: LibraryFilterExpression = {
    kind: "group",
    mode: "or",
    children: [
      { kind: "clause", field: "year", operator: "=", value: "2020" },
      {
        kind: "group",
        mode: "and",
        children: [{ kind: "clause", field: "unwatched", operator: "=", value: "1" }],
      },
    ],
  };
  // No loaded-item argument: an unseen item can enter or leave these results.
  expect(decide(change(["viewCount"]), { filterExpression })).toBe("refresh");
  expect(
    decide(change(["Genre"]), {
      filterExpression: { kind: "clause", field: "genre", operator: "=", value: "1" },
    }),
  ).toBe("refresh");
  expect(
    decide(change(["summary"]), {
      filterExpression: { kind: "clause", field: "futurePredicate", operator: "=", value: "1" },
    }),
  ).toBe("refresh");
  // The card projection omits Role; equality of cards cannot establish actor membership.
  expect(decide(change(["summary"]), {
    filterExpression: { kind: "clause", field: "actor", operator: "=", value: "1" },
  })).toBe("refresh");
  expect(decide(change(["unknown"]))).toBe("refresh");
  expect(
    decide(change(["summary"]), {
      filterExpression: { kind: "clause", field: "year", operator: "=", value: "2020" },
    }),
  ).toBe("patch");
});

it("refreshes positional sources, parent aggregates, and uncertain/structural effects", () => {
  expect(decide(change(["viewOffset"]), { source: "onDeck" })).toBe("refresh");
  expect(decide({ ...change(["viewCount"]), parentIds: ["50"] }, { type: "show" })).toBe("refresh");
  expect(decide({ ...change(["viewCount"]), parentIds: ["50"] }, { type: undefined })).toBe(
    "refresh",
  );
  for (const effect of ["unknown", "membership"] as const)
    expect(decide({ ...change([]), kind: "item", effect })).toBe("refresh");
  expect(decide(change([]))).toBe("ignore");
});

it("keeps server/profile/section and list scopes separate", () => {
  for (const overrides of [{ serverId: "other" }, { profileKey: "other" }, { sectionId: "3" }])
    expect(decide({ ...change(["summary"]), ...overrides })).toBe("ignore");
  expect(decide({ ...change(["librarySectionID"]), sectionId: "3" })).toBe("refresh");
  expect(decide({ ...change([]), kind: "recovery" })).toBe("refresh");
  const { serverId, profileKey, sectionId } = change([]);
  const scope = { serverId, profileKey, sectionId };
  expect(decide({ ...scope, kind: "list", listKind: "playlist", id: "9" })).toBe("ignore");
  expect(decide({ ...scope, kind: "list", listKind: "collection", id: "7" })).toBe("refresh");
});

it("canonicalizes filters and isolates result/page identities", () => {
  const first = {
    kind: "clause",
    field: "year",
    operator: "=",
    value: "2020",
    valueLabel: "label",
  } as const;
  const second = { kind: "clause", field: "genre", operator: "=", value: "1" } as const;
  const left: LibraryQuery = {
    ...query,
    filterExpression: { kind: "group", mode: "and", children: [first, second] },
  };
  const right: LibraryQuery = {
    ...query,
    filterExpression: { kind: "group", mode: "and", children: [second, first, first] },
  };
  expect(libraryResultQueryKey("server", left)).toEqual(libraryResultQueryKey("server", right));
  const key = libraryPageQueryKey("server", left, 1, 9984);
  expect(key.slice(-4)).toEqual(["page", 1, 9984, 64]);
  expect(libraryPageQueryKey("server", right, 1, 9984)).toEqual(key);
  for (const [revision, offset, size] of [
    [2, 9984, 64],
    [1, 10048, 64],
    [1, 9984, 128],
  ])
    expect(libraryPageQueryKey("server", left, revision, offset, size)).not.toEqual(key);
  expect(libraryPageQueryKey("other", left, 1, 9984)).not.toEqual(key);
  for (const overrides of [
    { profileKey: "other" },
    { sectionId: 3 },
    { seed: "new" },
    { source: "onDeck" as const },
    { type: "episode" as const },
    { sort: "year:desc" },
    { filterExpression: undefined },
  ])
    expect(libraryPageQueryKey("server", { ...left, ...overrides }, 1, 9984)).not.toEqual(key);
});

it("isolates child windows and refreshes parent moves without borrowing another parent's pages", () => {
  const children = { ...query, source: "children" as const, parentId: "50", type: "track" as const };
  expect(libraryResultQueryKey("server", children)).not.toEqual(libraryResultQueryKey("server", { ...children, parentId: "51" }));
  expect(decideLibrarySynchronization("server", children, { ...change(["thumb"]), parentIds: ["51"] })).toBe("ignore");
  expect(decideLibrarySynchronization("server", children, { ...change(["thumb"]), parentIds: ["50"] })).toBe("patch");
  expect(decideLibrarySynchronization("server", children, { ...change(["parentRatingKey"]), parentIds: ["51"] })).toBe("refresh");
});
