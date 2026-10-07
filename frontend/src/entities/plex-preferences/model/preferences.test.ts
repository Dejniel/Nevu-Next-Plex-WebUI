import {
  normalizePlexPreferences,
  preferenceChanges,
  preferenceValueError,
  validatePreferenceChanges,
} from "@nevu/contracts";

const preferences = normalizePlexPreferences([
  {
    id: "enabled",
    type: "bool",
    value: false,
    default: true,
    summary: "Description",
    group: "network",
    advanced: "1",
  },
  { id: "integer", type: "int", value: "2", default: 1 },
  { id: "decimal", type: "double", value: "0.750", default: 0.5 },
  {
    id: "language",
    type: "text",
    value: "",
    default: "",
    enumValues: ":Account default|pl:Polish: native",
  },
  { id: "hidden", type: "text", hidden: true, value: "secret" },
]);

it("retains field metadata, normalizes scalar values and excludes hidden fields", () => {
  expect(preferences[0]).toMatchObject({
    value: "0",
    default: "1",
    advanced: true,
    group: "network",
    summary: "Description",
  });
  expect(preferences[2].value).toBe("0.75");
  expect(preferences).toHaveLength(4);
  expect(preferences[3].choices).toEqual([
    { value: "", label: "Account default" },
    { value: "pl", label: "Polish: native" },
  ]);
});

it("compares canonical values while preserving an empty text selection", () => {
  expect(
    preferenceChanges(preferences, {
      enabled: "false",
      integer: "02",
      decimal: "0.750",
      language: "pl",
    }),
  ).toEqual({ language: "pl" });
  expect(validatePreferenceChanges(preferences, { language: "" })).toEqual({});
});

it.each(["", "2.5", "Infinity", "1e2", "9007199254740992"])(
  "rejects invalid integer %s",
  (value) => {
    expect(preferenceValueError(preferences[1], value)).toBeTruthy();
  },
);

it.each(["0.25", "-1.5", "1e-3"])("accepts finite decimal %s", (value) => {
  expect(preferenceValueError(preferences[2], value)).toBeUndefined();
});

it.each(["", "NaN", "Infinity", "0x10", "1,5"])(
  "rejects invalid decimal %s",
  (value) => {
    expect(preferenceValueError(preferences[2], value)).toBeTruthy();
  },
);

it("validates identifiers, types and current choices", () => {
  expect(() =>
    validatePreferenceChanges(preferences, { hidden: "new" }),
  ).toThrow("hidden");
  expect(() => validatePreferenceChanges(preferences, { enabled: {} })).toThrow(
    "valid value",
  );
  expect(() =>
    validatePreferenceChanges(preferences, { language: "en" }),
  ).toThrow("available values");
});
