import type {
  LibraryDetails,
  LibraryInput,
  LibraryUpdateInput,
} from "entities/library/model";

export type LibraryFormDraft = Partial<LibraryInput>;
export type LibraryFormErrors = Partial<
  Record<"name" | "language" | "locations", string>
>;

/** Untouched fields follow canonical reads; only user edits live in the draft. */
export function libraryFormValues(
  details: LibraryDetails | undefined,
  draft: LibraryFormDraft,
): LibraryInput {
  return {
    type: draft.type ?? "movie",
    name: draft.name ?? details?.library.title ?? "",
    // The Personal Media agent used for Other videos only accepts "xn" (no language).
    language:
      !details && draft.type === "video"
        ? "xn"
        : (draft.language ?? details?.library.language ?? "en-US"),
    locations: draft.locations ?? details?.library.locations ?? [],
  };
}

function equal(field: keyof LibraryInput, left: unknown, right: unknown) {
  return field === "locations"
    ? JSON.stringify(left) === JSON.stringify(right)
    : left === right;
}

export function setLibraryFormField<K extends keyof LibraryInput>(
  details: LibraryDetails | undefined,
  draft: LibraryFormDraft,
  field: K,
  value: LibraryInput[K],
): LibraryFormDraft {
  const next = { ...draft, [field]: value };
  if (equal(field, value, libraryFormValues(details, {})[field]))
    delete next[field];
  return next;
}

export function libraryFormErrors(values: LibraryInput): LibraryFormErrors {
  return {
    ...(!values.name.trim() && { name: "Enter a library name." }),
    ...(!values.language.trim() && { language: "Choose a library language." }),
    ...((!values.locations.length ||
      values.locations.some((path) => !path.trim())) && {
      locations: "Select at least one folder.",
    }),
  };
}

export function libraryGeneralChanges(
  details: LibraryDetails,
  draft: LibraryFormDraft,
): LibraryUpdateInput {
  const values = libraryFormValues(details, draft);
  return {
    ...(draft.name !== undefined &&
      values.name.trim() !== details.library.title && {
        name: values.name.trim(),
      }),
    ...(draft.language !== undefined &&
      values.language !== details.library.language && {
        language: values.language,
      }),
    ...(draft.locations !== undefined &&
      !equal("locations", values.locations, details.library.locations) && {
        locations: values.locations,
      }),
  };
}
