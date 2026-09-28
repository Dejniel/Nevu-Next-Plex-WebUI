import type { LibraryFilterClause } from "@nevu/contracts";
import {
  libraryFilterFields,
  libraryFilterIsOperator,
  libraryFilterOperators,
  libraryFilterSource,
  libraryFiltersForType,
  normalizeLibraryFilters,
  readLibraryFilterMode,
  readLibraryFilters,
  writeLibraryFilterMode,
  writeLibraryFilters,
} from "./libraryFilters";

const fields: Plex.Field[] = [
  { key: "show.genre", title: "Genre", type: "tag" },
  { key: "show.year", title: "Year", type: "integer" },
];
const fieldTypes: Plex.FieldType[] = [
  { type: "tag", Operator: [{ key: "=", title: "is" }] },
  { type: "integer", Operator: [{ key: ">>=", title: "is greater than" }] },
];

it("round-trips normalized filters through URL parameters", () => {
  const params = new URLSearchParams("unrelated=kept");
  const filters: LibraryFilterClause[] = [
    { field: "show.year", operator: ">>=", value: "2020" },
    { field: "show.genre", operator: "=", value: "393", valueLabel: "Action" },
  ];

  writeLibraryFilters(params, filters);
  writeLibraryFilterMode(params, "or");

  expect(params.get("unrelated")).toBe("kept");
  expect(readLibraryFilterMode(params)).toBe("or");
  expect(readLibraryFilters(params)).toEqual(normalizeLibraryFilters(filters));
});

it("defaults filter matching to all clauses", () => {
  expect(readLibraryFilterMode(new URLSearchParams())).toBe("and");
});

it("drops malformed, duplicate, and injected filters", () => {
  const params = new URLSearchParams();
  params.append("filter", JSON.stringify(["show.genre", "=", "393", "Action"]));
  params.append("filter", JSON.stringify(["show.genre", "=", "393", "Action"]));
  params.append("filter", JSON.stringify(["show.genre&sort", "=", "393"]));
  params.append("filter", JSON.stringify(["show.genre", "=", "393\nother"]));
  params.append("filter", JSON.stringify(["show.genre", "=", "393", "Action\u007f"]));
  params.append("filter", JSON.stringify(["show.genre", "=", "x".repeat(257)]));
  params.append("filter", "not-json");

  expect(readLibraryFilters(params)).toEqual([
    { field: "show.genre", operator: "=", value: "393", valueLabel: "Action" },
  ]);
});

it("uses Plex field types and unscoped filter value endpoints", () => {
  expect(libraryFilterOperators(fields[1], fieldTypes)).toEqual([
    { key: ">>=", title: "is greater than" },
  ]);
  const types = [{
    key: "/library/sections/2/all?type=2",
    type: "show",
    title: "Shows",
    active: true,
    Field: fields,
    Filter: [{
      filter: "genre",
      filterType: "string",
      key: "/library/sections/2/genre?type=2",
      title: "Genre",
      type: "filter",
    }],
  }, {
    key: "/library/sections/2/all?type=4",
    type: "episode",
    title: "Episodes",
    active: false,
    Field: [{ key: "episode.year", title: "Episode year", type: "integer" }],
    Filter: [{
      filter: "year",
      filterType: "integer",
      key: "/library/sections/2/year?type=4",
      title: "Episode year",
      type: "filter",
    }],
  }] as Plex.Type[];
  expect(libraryFilterFields(types)).toEqual([
    ...fields,
    { key: "episode.year", title: "Episode year", type: "integer" },
  ]);
  expect(libraryFilterSource(fields[0], types)?.key).toContain("/genre");
  expect(libraryFilterSource(types[1].Field?.[0], types)?.key).toContain("/year");
  expect(libraryFiltersForType([
    { field: "show.genre", operator: "=", value: "393" },
    { field: "show.genre", operator: ">=", value: "393" },
  ], libraryFilterFields(types), fieldTypes)).toEqual([
    { field: "show.genre", operator: "=", value: "393" },
  ]);
});

it("selects only an exact Plex is operator for simple filters", () => {
  expect(libraryFilterIsOperator(fields[0], fieldTypes)).toEqual({ key: "=", title: "is" });
  expect(libraryFilterIsOperator(fields[1], fieldTypes)).toBeUndefined();
});
