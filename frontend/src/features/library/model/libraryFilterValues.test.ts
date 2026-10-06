import { libraryFilterValues } from "./libraryFilterValues";

it("extracts stable exact and qualified values, deduplicating while preserving Plex order", () => {
  expect(libraryFilterValues([
    { key: "fallback", title: "Action", fastKey: "/library/sections/1/all?genre=393" },
    { key: "other", title: "Duplicate", fastKey: "/library/sections/1/all?movie.genre=393" },
    { key: "fallback", title: "Drama", fastKey: "/library/sections/1/all?movie.genre=394" },
    { key: "395", title: "Comedy" },
    { key: "396", title: "" },
  ], "genre")).toEqual([
    { value: "393", label: "Action" },
    { value: "394", label: "Drama" },
    { value: "395", label: "Comedy" },
  ]);
});

it("accepts empty directories and falls back to the key when a fast key is unusable", () => {
  expect(libraryFilterValues(undefined, "genre")).toEqual([]);
  expect(libraryFilterValues([{ key: "1", title: "Action", fastKey: "http://[invalid" }], "genre"))
    .toEqual([{ value: "1", label: "Action" }]);
});
