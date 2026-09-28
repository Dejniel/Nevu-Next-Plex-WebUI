import {
  createLibraryFilterExpression,
  libraryFilterExpressionKey,
  normalizeLibraryFilterExpression,
} from "./libraryFilterExpression";

const genre = (value: string, valueLabel?: string) => ({
  kind: "clause" as const,
  field: "genre",
  operator: "=" as const,
  value,
  ...(valueLabel && { valueLabel }),
});

it("creates the simple group used by the current filter UI", () => {
  expect(createLibraryFilterExpression("or", [
    { field: "genre", operator: "=", value: "5", valueLabel: "Comedy" },
    { field: "genre", operator: "=", value: "4", valueLabel: "Action" },
  ])).toEqual({
    kind: "group",
    mode: "or",
    children: [genre("4"), genre("5")],
  });
});

it("canonicalizes nested groups, duplicates, order, and display labels", () => {
  const nested = {
    kind: "group" as const,
    mode: "and" as const,
    children: [
      genre("5", "Comedy"),
      {
        kind: "group" as const,
        mode: "and" as const,
        children: [genre("4", "Action"), genre("5", "Komedia")],
      },
    ],
  };
  const flat = {
    kind: "group" as const,
    mode: "and" as const,
    children: [genre("4"), genre("5")],
  };

  expect(normalizeLibraryFilterExpression(nested)).toEqual(flat);
  expect(libraryFilterExpressionKey(nested)).toBe(libraryFilterExpressionKey(flat));
});
