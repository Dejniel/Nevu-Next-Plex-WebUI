import type { LibraryDetails } from "entities/library/model";
import {
  libraryFormErrors,
  libraryFormValues,
  libraryGeneralChanges,
  setLibraryFormField,
} from "./libraryForm";

const details: LibraryDetails = {
  library: {
    id: "1",
    uuid: "movies",
    type: "movie",
    title: "Movies",
    language: "en-US",
    locations: ["/data/movies"],
    agent: "agent",
    scanner: "scanner",
    refreshing: false,
    updatedAt: null,
    scannedAt: null,
  },
  preferences: [],
};

it("validates creation defaults and permits filesystem formats supplied by PMS", () => {
  const values = libraryFormValues(undefined, {});
  expect(values).toEqual({
    type: "movie",
    name: "",
    language: "en-US",
    locations: [],
  });
  expect(libraryFormErrors(values)).toEqual({
    name: "Enter a library name.",
    locations: "Select at least one folder.",
  });
  expect(
    libraryFormErrors({
      ...values,
      name: "Music",
      locations: ["C:\\Music", "\\\\NAS\\Music", "/music"],
    }),
  ).toEqual({});
});

it("rejects blank names, languages and selected paths", () => {
  expect(
    libraryFormErrors({
      type: "movie",
      name: "  ",
      language: "",
      locations: [" "],
    }),
  ).toEqual({
    name: "Enter a library name.",
    language: "Choose a library language.",
    locations: "Select at least one folder.",
  });
});

it("uses the Personal Media language for Other videos without losing the user's language choice", () => {
  const movieDraft = { language: "pl-PL" };
  const videoDraft = setLibraryFormField(
    undefined,
    movieDraft,
    "type",
    "video",
  );
  expect(libraryFormValues(undefined, videoDraft).language).toBe("xn");
  const reverted = setLibraryFormField(undefined, videoDraft, "type", "movie");
  expect(libraryFormValues(undefined, reverted).language).toBe("pl-PL");
  expect(
    libraryFormValues(
      { ...details, library: { ...details.library, language: "xn" } },
      {},
    ).language,
  ).toBe("xn");
});

it("follows background reads for untouched fields while preserving edits", () => {
  const draft = setLibraryFormField(details, {}, "name", "My movies");
  const refreshed = {
    ...details,
    library: {
      ...details.library,
      title: "External name",
      language: "pl-PL",
      locations: ["/new/path"],
    },
  };
  expect(libraryFormValues(refreshed, draft)).toMatchObject({
    name: "My movies",
    language: "pl-PL",
    locations: ["/new/path"],
  });
  expect(libraryGeneralChanges(refreshed, draft)).toEqual({
    name: "My movies",
  });
});

it("releases a reverted field so later reads can update it", () => {
  const renamed = setLibraryFormField(details, {}, "name", "Renamed");
  const reverted = setLibraryFormField(details, renamed, "name", "Movies");
  expect(libraryGeneralChanges(details, reverted)).toEqual({});
  expect(
    libraryFormValues(
      { ...details, library: { ...details.library, title: "External" } },
      reverted,
    ).name,
  ).toBe("External");
});

it("trims the submitted name and omits unchanged values and the immutable library type", () => {
  expect(
    libraryGeneralChanges(details, {
      name: " Movies ",
      language: "en-US",
      locations: ["/data/movies"],
      type: "artist",
    }),
  ).toEqual({});
  expect(
    libraryGeneralChanges(details, {
      name: " New name ",
      language: "pl-PL",
      locations: ["/data/movies", "/archive"],
    }),
  ).toEqual({
    name: "New name",
    language: "pl-PL",
    locations: ["/data/movies", "/archive"],
  });
});

it("does not create edits merely by reading an unusual existing name or language", () => {
  const existing = {
    ...details,
    library: {
      ...details.library,
      title: " Movies ",
      language: "custom-locale",
    },
  };
  expect(libraryGeneralChanges(existing, {})).toEqual({});
  expect(libraryFormValues(existing, {}).language).toBe("custom-locale");
});

it("keeps canonical folder arrays intact and discards a reverted folder edit", () => {
  const original = Object.freeze({
    ...details,
    library: Object.freeze({
      ...details.library,
      locations: Object.freeze(["/data/movies"]) as unknown as string[],
    }),
  });
  const added = setLibraryFormField(original, {}, "locations", [
    "/data/movies",
    "/archive",
  ]);
  expect(libraryGeneralChanges(original, added)).toEqual({
    locations: ["/data/movies", "/archive"],
  });
  const reverted = setLibraryFormField(original, added, "locations", [
    "/data/movies",
  ]);
  expect(libraryGeneralChanges(original, reverted)).toEqual({});
  expect(original.library.locations).toEqual(["/data/movies"]);
});
