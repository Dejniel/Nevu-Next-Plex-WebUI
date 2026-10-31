import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { usePreferenceDraft } from "entities/plex-preferences/model";
import {
  validatePreferenceChanges,
  type PlexPreference,
} from "@nevu/contracts";
import { serverQueryClient } from "shared/api/queryClient";
import {
  createMetadataEditor,
  MetadataSaveError,
  validArtworkURL,
  type ArtworkChanges,
  type ArtworkUpdate,
  type MetadataSaveInput,
} from "../api/metadata";
import {
  draftFromMetadata,
  metadataChanges,
  metadataDraftErrors,
  metadataFields,
  metadataLocks,
  metadataMusicParents,
  metadataParentChanges,
  sameMetadataValue,
  type MetadataEditingItem,
  type MetadataField,
  type MetadataValue,
  type MetadataLockUpdate,
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
  const [initial] = useState(data);
  const [source, setSource] = useState(() => createMetadataEditor(initial));
  const [baseline] = useState(() => draftFromMetadata(initial));
  const [initialLocks, setInitialLocks] = useState(() =>
    metadataLocks(initial),
  );
  const [draft, setDraft] = useState(baseline);
  const [locks, setLocks] = useState(initialLocks);
  const [artwork, setArtwork] = useState<ArtworkChanges>({});
  const [section, changeSection] = useState<MetadataEditorSection>("general");
  const [loadPreferences, setLoadPreferences] = useState(false);
  const [originalParents] = useState(() => metadataMusicParents(initial));
  const [parents, setParents] = useState(originalParents);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  const preferencesKey = [
    "metadata-preferences",
    source.scope?.serverId,
    source.scope?.profileKey,
    source.revision,
    source.id,
  ] as const;
  const preferences = useQuery(
    {
      queryKey: preferencesKey,
      queryFn: ({ signal }) => source.preferences(signal),
      enabled: loadPreferences,
    },
    serverQueryClient,
  );
  const preferenceDraft = usePreferenceDraft(preferences.data ?? []);
  const fields = metadataFields(initial.type).filter(
    (field) =>
      field.id !== "editionTitle" ||
      source.capabilities.edition ||
      initial.editionTitle,
  );
  const changes = metadataChanges(baseline, draft);
  const parentChanges = metadataParentChanges(originalParents, parents);
  const lockChanges: MetadataLockUpdate = Object.fromEntries(
    [...fields.map((field) => field.id), ...source.capabilities.artwork]
      .filter(
        (field) =>
          changes[field as MetadataField] !== undefined ||
          Object.hasOwn(artwork, field) ||
          Boolean(locks[field]) !== Boolean(initialLocks[field]),
      )
      .map((field) => [field, Boolean(locks[field])]),
  );
  const mutation = useMutation(
    {
      mutationKey: [
        "metadata-edit",
        source.scope?.serverId,
        source.scope?.profileKey,
        source.revision,
        initial.ratingKey,
      ],
      mutationFn: async (values: MetadataSaveInput) => {
        source.assertCurrent();
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
        if (error.completed.replacement) {
          setSource(createMetadataEditor(error.completed.replacement));
          onRelocated?.(error.completed.replacement.ratingKey);
        }
        setArtwork((current) =>
          Object.fromEntries(
            Object.entries(current).filter(
              ([field]) =>
                !error.completed.artwork.includes(field as ArtworkField),
            ),
          ),
        );
        setInitialLocks((current) => ({
          ...current,
          ...Object.fromEntries(
            error.completed.artwork.map((field) => [field, true]),
          ),
        }));
        if (error.completed.preferences) {
          serverQueryClient.setQueryData<PlexPreference[]>(
            preferencesKey,
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
  const errors = metadataDraftErrors(initial.type, draft);
  let preferencesValid = true;
  try {
    validatePreferenceChanges(preferences.data ?? [], preferenceDraft.draft);
  } catch {
    preferencesValid = false;
  }
  const parentsValid =
    !Object.keys(parentChanges).length ||
    Boolean(parents.artist && (initial.type !== "track" || parents.album));
  const dirty = Boolean(
    Object.keys(changes).length ||
      Object.keys(lockChanges).length ||
      Object.keys(artwork).length ||
      Object.keys(preferenceDraft.changes).length ||
      Object.keys(parentChanges).length,
  );
  const valid =
    parentsValid &&
    preferencesValid &&
    !Object.keys(errors).length &&
    !Object.values(artwork).some(
      (value) => value.type === "url" && !validArtworkURL(value.url),
    );
  return {
    initial,
    source,
    section,
    setSection: (next: MetadataEditorSection) => {
      changeSection(next);
      if (next === "advanced") setLoadPreferences(true);
    },
    fields,
    draft,
    locks,
    artwork,
    parents,
    errors,
    preferences,
    preferenceDraft,
    mutation,
    canSave: dirty && valid && !mutation.isPending,
    save: () => {
      if (dirty && valid && !mutation.isPending)
        mutation.mutate({
          changes,
          locks: lockChanges,
          artwork,
          preferences: preferenceDraft.changes,
          parents: parentChanges,
        });
    },
    setField: (field: MetadataField, value: MetadataValue) => {
      setDraft((current) => ({ ...current, [field]: value }));
      setLocks((current) => ({
        ...current,
        [field]: sameMetadataValue(baseline[field], value)
          ? Boolean(initialLocks[field])
          : true,
      }));
    },
    setLock: (field: MetadataField | ArtworkField, locked: boolean) =>
      setLocks((current) => ({ ...current, [field]: locked })),
    setArtwork: (field: ArtworkField, value: ArtworkUpdate | undefined) => {
      setArtwork((current) => {
        const next = { ...current };
        if (value) next[field] = value;
        else delete next[field];
        return next;
      });
      setLocks((current) => ({
        ...current,
        [field]: value ? true : Boolean(initialLocks[field]),
      }));
    },
    setParent: (field: "artist" | "album", value: MetadataParent) =>
      setParents((current) => ({
        ...current,
        [field]: value,
        ...(field === "artist" &&
          initial.type === "track" &&
          value.id !== current.artist?.id && { album: undefined }),
      })),
  };
}
export type MetadataEditor = ReturnType<typeof useMetadataEditor>;
