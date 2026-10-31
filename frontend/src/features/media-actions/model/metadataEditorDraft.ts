import type { PreferenceChanges } from "@nevu/contracts";
import {
  artworkTypes,
  draftFromMetadata,
  metadataChanges,
  metadataFields,
  metadataLocks,
  metadataMusicParents,
  metadataParentChanges,
  sameMetadataValue,
  type ArtworkField,
  type MetadataEditingItem,
  type MetadataField,
  type MetadataLockUpdate,
  type MetadataMusicParents,
  type MetadataParent,
  type MetadataUpdate,
  type MetadataValue,
} from "./metadataEditing";

export type ArtworkUpdate =
  | { type: "existing"; url: string; preview: string }
  | { type: "url"; url: string }
  | { type: "file"; file: File }
  | { type: "remove" };
export type ArtworkChanges = Partial<Record<ArtworkField, ArtworkUpdate>>;
export interface MetadataSaveInput {
  changes: MetadataUpdate;
  locks: MetadataLockUpdate;
  artwork: ArtworkChanges;
  preferences?: PreferenceChanges;
  parents?: MetadataMusicParents;
}
export interface MetadataSaveProgress {
  artwork: ArtworkField[];
  preferences: boolean;
  replacement?: MetadataEditingItem;
}

export const metadataImageTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];
export function validArtworkURL(value: string) {
  try {
    return ["https:", "http:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}
export function metadataArtworkError(update: ArtworkUpdate) {
  if (update.type === "url" && !validArtworkURL(update.url))
    return "Enter an HTTP or HTTPS image URL.";
  if (
    update.type === "file" &&
    (!update.file.size || !metadataImageTypes.includes(update.file.type))
  )
    return "Choose a JPEG, PNG, WebP or GIF image.";
}

export function createMetadataDraft(item: MetadataEditingItem) {
  return {
    item,
    values: draftFromMetadata(item),
    locks: metadataLocks(item),
    artwork: {} as ArtworkChanges,
    parents: metadataMusicParents(item),
  };
}
type EditorDraft = ReturnType<typeof createMetadataDraft>;

/** Only the user's changes are written; acknowledged effects become the new baseline. */
export function metadataDraftChanges(state: EditorDraft) {
  const changes = metadataChanges(draftFromMetadata(state.item), state.values);
  const originalLocks = metadataLocks(state.item);
  const locks: MetadataLockUpdate = Object.fromEntries(
    [
      ...metadataFields(state.item.type).map((field) => field.id),
      ...(Object.keys(artworkTypes) as ArtworkField[]),
    ]
      .filter(
        (field) =>
          changes[field as MetadataField] !== undefined ||
          Object.hasOwn(state.artwork, field) ||
          Boolean(state.locks[field]) !== Boolean(originalLocks[field]),
      )
      .map((field) => [field, Boolean(state.locks[field])]),
  );
  return {
    changes,
    locks,
    artwork: state.artwork,
    parents: metadataParentChanges(
      metadataMusicParents(state.item),
      state.parents,
    ),
  };
}

type DraftAction =
  | { type: "field"; field: MetadataField; value: MetadataValue }
  | { type: "lock"; field: MetadataField | ArtworkField; value: boolean }
  | { type: "artwork"; field: ArtworkField; value?: ArtworkUpdate }
  | { type: "parent"; field: "artist" | "album"; value: MetadataParent }
  | { type: "acknowledged"; completed: MetadataSaveProgress };

export function metadataDraftReducer(
  state: EditorDraft,
  action: DraftAction,
): EditorDraft {
  switch (action.type) {
    case "field":
      return {
        ...state,
        values: { ...state.values, [action.field]: action.value },
        locks: {
          ...state.locks,
          [action.field]: sameMetadataValue(
            draftFromMetadata(state.item)[action.field],
            action.value,
          )
            ? Boolean(metadataLocks(state.item)[action.field])
            : true,
        },
      };
    case "lock":
      return {
        ...state,
        locks: { ...state.locks, [action.field]: action.value },
      };
    case "artwork": {
      const artwork = { ...state.artwork };
      if (action.value) artwork[action.field] = action.value;
      else delete artwork[action.field];
      return {
        ...state,
        artwork,
        locks: {
          ...state.locks,
          [action.field]: action.value
            ? true
            : Boolean(metadataLocks(state.item)[action.field]),
        },
      };
    }
    case "parent":
      return {
        ...state,
        parents: {
          ...state.parents,
          [action.field]: action.value,
          ...(action.field === "artist" &&
            state.item.type === "track" &&
            action.value.id !== state.parents.artist?.id && {
              album: undefined,
            }),
        },
      };
    case "acknowledged": {
      const { completed } = action;
      const pending = metadataDraftChanges(state);
      const item = completed.replacement ?? state.item;
      const locks = {
        ...metadataLocks(item),
        ...Object.fromEntries(completed.artwork.map((field) => [field, true])),
      };
      return {
        item: {
          ...item,
          Field: Object.entries(locks).map(([name, locked]) => ({
            name,
            locked,
          })),
        },
        values: completed.replacement
          ? { ...draftFromMetadata(item), ...pending.changes }
          : state.values,
        locks: completed.replacement
          ? { ...metadataLocks(item), ...pending.locks }
          : state.locks,
        artwork: Object.fromEntries(
          Object.entries(state.artwork).filter(
            ([field]) => !completed.artwork.includes(field as ArtworkField),
          ),
        ),
        parents: completed.replacement
          ? { ...metadataMusicParents(item), ...pending.parents }
          : state.parents,
      };
    }
  }
}
