import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useReducer, useRef, useState } from "react";
import { usePreferenceDraft } from "entities/plex-preferences/model";
import {
  validatePreferenceChanges,
  type PlexPreference,
} from "@nevu/contracts";
import { serverQueryClient } from "shared/api/queryClient";
import { createMetadataEditor, MetadataSaveError } from "../api/metadata";
import {
  createMetadataDraft,
  metadataArtworkError,
  metadataDraftChanges,
  metadataDraftReducer,
  type ArtworkUpdate,
  type MetadataSaveInput,
} from "./metadataEditorDraft";
import {
  metadataDraftErrors,
  metadataFields,
  type MetadataEditingItem,
  type MetadataField,
  type MetadataValue,
  type ArtworkField,
  type MetadataParent,
} from "./metadataEditing";

export type MetadataEditorSection = "general" | "tags" | "artwork" | "advanced";

/** One opened draft and mutation; Query owns its cancellable server resources. */
export function useMetadataEditor(
  data: MetadataEditingItem,
  onClose: () => void,
  onSaved?: (result: { ratingKey: string }) => void,
  onRelocated?: (ratingKey: string) => void,
) {
  const [initialID] = useState(data.ratingKey);
  const [source, setSource] = useState(() => createMetadataEditor(data));
  const [state, dispatch] = useReducer(
    metadataDraftReducer,
    data,
    createMetadataDraft,
  );
  const [section, changeSection] = useState<MetadataEditorSection>("general");
  const [loadPreferences, setLoadPreferences] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  const preferences = useQuery(
    {
      queryKey: [...source.queryKey, "preferences"],
      queryFn: ({ signal }) => source.preferences(signal),
      enabled: loadPreferences,
    },
    serverQueryClient,
  );
  const preferenceDraft = usePreferenceDraft(preferences.data ?? []);
  const pending = metadataDraftChanges(state);
  const mutation = useMutation(
    {
      mutationKey: [
        "metadata-edit",
        source.scope?.serverId,
        source.scope?.profileKey,
        source.revision,
        initialID,
      ],
      mutationFn: (values: MetadataSaveInput) => {
        const controller = new AbortController();
        request.current = controller;
        return source.save(values, controller.signal);
      },
      retry: false,
      onSuccess: (result) => {
        try {
          source.assertCurrent(request.current?.signal);
        } catch {
          return;
        }
        onSaved?.(result);
        onClose();
      },
      onError: (error, values) => {
        try {
          source.assertCurrent(request.current?.signal);
        } catch {
          return;
        }
        if (!(error instanceof MetadataSaveError)) return;
        const nextSource = error.completed.replacement
          ? createMetadataEditor(error.completed.replacement)
          : source;
        dispatch({ type: "acknowledged", completed: error.completed });
        if (nextSource !== source) {
          setSource(nextSource);
          onRelocated?.(nextSource.id);
        }
        if (error.completed.preferences) {
          serverQueryClient.setQueryData<PlexPreference[]>(
            [...nextSource.queryKey, "preferences"],
            (current) =>
              current?.map((preference) => ({
                ...preference,
                value: values.preferences?.[preference.id] ?? preference.value,
              })),
          );
          preferenceDraft.reset();
        }
      },
    },
    serverQueryClient,
  );
  const errors = metadataDraftErrors(state.item.type, state.values);
  let preferencesValid = true;
  try {
    validatePreferenceChanges(preferences.data ?? [], preferenceDraft.draft);
  } catch {
    preferencesValid = false;
  }
  const parentsValid =
    !Object.keys(pending.parents).length ||
    Boolean(
      state.parents.artist &&
      (state.item.type !== "track" || state.parents.album),
    );
  const input = { ...pending, preferences: preferenceDraft.changes };
  const dirty = Object.values(input).some(
    (changes) => Object.keys(changes).length,
  );
  const valid =
    parentsValid &&
    preferencesValid &&
    !Object.keys(errors).length &&
    !Object.values(state.artwork).some(metadataArtworkError);
  return {
    item: state.item,
    source,
    section,
    setSection: (next: MetadataEditorSection) => {
      changeSection(next);
      if (next === "advanced") setLoadPreferences(true);
    },
    fields: metadataFields(state.item.type).filter(
      (field) =>
        field.id !== "editionTitle" ||
        source.capabilities.edition ||
        state.item.editionTitle,
    ),
    draft: state.values,
    locks: state.locks,
    artwork: state.artwork,
    parents: state.parents,
    parentChanges: pending.parents,
    errors,
    preferences,
    preferenceDraft,
    mutation,
    canSave: dirty && valid && !mutation.isPending,
    save: () => {
      if (dirty && valid && !mutation.isPending) mutation.mutate(input);
    },
    setField: (field: MetadataField, value: MetadataValue) =>
      dispatch({ type: "field", field, value }),
    setLock: (field: MetadataField | ArtworkField, value: boolean) =>
      dispatch({ type: "lock", field, value }),
    setArtwork: (field: ArtworkField, value: ArtworkUpdate | undefined) =>
      dispatch({ type: "artwork", field, value }),
    setParent: (field: "artist" | "album", value: MetadataParent) =>
      dispatch({ type: "parent", field, value }),
  };
}
export type MetadataEditor = ReturnType<typeof useMetadataEditor>;
