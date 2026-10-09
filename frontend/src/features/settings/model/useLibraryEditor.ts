import { useRef, useState } from "react";
import type { PreferenceChanges } from "@nevu/contracts";
import type { LibraryInput } from "entities/library/model";
import {
  usePreferenceDraft,
  validatePreferenceChanges,
} from "entities/plex-preferences/model";
import {
  libraryFormErrors,
  libraryFormValues,
  libraryGeneralChanges,
  setLibraryFormField,
  type LibraryFormDraft,
  type LibraryFormErrors,
} from "./libraryForm";
import {
  useLibraryChange,
  useManagedLibrary,
} from "./useLibraryAdministration";

export type LibraryEditorTab = "general" | "folders" | "advanced";

export function useLibraryEditor(
  libraryId: string | null,
  onSaved: (message: string) => void,
) {
  const query = useManagedLibrary(libraryId);
  const details = query.data;
  const [draft, setDraft] = useState<LibraryFormDraft>({});
  const values = libraryFormValues(details, draft);
  const preferences = usePreferenceDraft(details?.preferences ?? []);
  const [tab, setTab] = useState<LibraryEditorTab>("general");
  const [errors, setErrors] = useState<LibraryFormErrors>({});
  const [validationError, setValidationError] = useState<string | null>(null);
  const change = useLibraryChange();
  const submitting = useRef(false);
  const generalChanges = details ? libraryGeneralChanges(details, draft) : {};
  const dirty =
    !libraryId ||
    Object.keys(generalChanges).length > 0 ||
    Object.keys(preferences.changes).length > 0;
  const canSave =
    !change.isPending && (!libraryId || Boolean(details && dirty));
  const setField = <K extends keyof LibraryInput>(
    field: K,
    value: LibraryInput[K],
  ) => {
    setDraft((current) => setLibraryFormField(details, current, field, value));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };
  return {
    title: libraryId
      ? `Edit ${details?.library.title || "library"}`
      : "Add library",
    editing: Boolean(libraryId),
    loading: Boolean(libraryId && query.isPending),
    available: !libraryId || Boolean(details),
    readError: query.error,
    retry: () => void query.refetch(),
    values,
    hasMetadataLanguage: values.language !== "xn",
    setField,
    errors,
    preferences,
    visiblePreferences: details?.preferences ?? [],
    tab,
    setTab,
    saving: change.isPending,
    canSave,
    error: validationError ?? change.error?.message ?? null,
    addFolder(path: string) {
      setDraft((current) => {
        const locations = libraryFormValues(details, current).locations;
        return setLibraryFormField(
          details,
          current,
          "locations",
          locations.includes(path) ? locations : [...locations, path],
        );
      });
      setErrors((current) => ({ ...current, locations: undefined }));
    },
    removeFolder(path: string) {
      setDraft((current) =>
        setLibraryFormField(
          details,
          current,
          "locations",
          libraryFormValues(details, current).locations.filter(
            (location) => location !== path,
          ),
        ),
      );
    },
    async save() {
      if (!canSave || submitting.current) return;
      const errors = libraryFormErrors(values);
      setErrors(errors);
      setValidationError(null);
      if (Object.keys(errors).length) {
        setTab(errors.name || errors.language ? "general" : "folders");
        return;
      }
      let preferenceChanges: PreferenceChanges;
      try {
        preferenceChanges = validatePreferenceChanges(
          details?.preferences ?? [],
          preferences.draft,
        );
      } catch (reason) {
        setValidationError(
          reason instanceof Error
            ? reason.message
            : "Invalid library preferences.",
        );
        setTab("advanced");
        return;
      }
      submitting.current = true;
      try {
        await change.mutateAsync(
          libraryId && details
            ? {
                type: "update",
                id: libraryId,
                input: {
                  ...generalChanges,
                  ...(Object.keys(preferenceChanges).length && {
                    preferences: preferenceChanges,
                  }),
                },
              }
            : {
                type: "create",
                input: { ...values, name: values.name.trim() },
              },
        );
        onSaved(libraryId ? "Library updated." : "Library created.");
      } catch {
        // Query owns request failures; the sparse draft remains available for retry.
      } finally {
        submitting.current = false;
      }
    },
  };
}
