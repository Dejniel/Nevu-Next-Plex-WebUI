import type { MediaItemData } from "entities/media/model";

const textFields = {
  title: ["title", "Title", "text"],
  titleSort: ["titleSort", "Sort title", "text"],
  originalTitle: ["originalTitle", "Original title", "text"],
  originallyAvailableAt: ["originallyAvailableAt", "Release date", "date"],
  year: ["year", "Year", "number"],
  studio: ["studio", "Studio", "text"],
  contentRating: ["contentRating", "Content rating", "text"],
  tagline: ["tagline", "Tagline", "text"],
  summary: ["summary", "Summary", "multiline"],
  index: ["index", "Number", "number"],
  parentIndex: ["parentIndex", "Disc number", "number"],
} as const;

export const metadataTagFields = {
  genre: ["Genre", "Genres"],
  collection: ["Collection", "Collections"],
  label: ["Label", "Labels"],
  country: ["Country", "Countries"],
  director: ["Director", "Directors"],
  writer: ["Writer", "Writers"],
  producer: ["Producer", "Producers"],
  actor: ["Role", "Cast"],
  mood: ["Mood", "Moods"],
  style: ["Style", "Styles"],
  similar: ["Similar", "Similar artists"],
  tag: ["Tag", "Tags"],
} as const;

type MetadataTextField = keyof typeof textFields;
export type MetadataTagField = keyof typeof metadataTagFields;
export type ArtworkField = "thumb" | "art";
export type MetadataField = MetadataTextField | MetadataTagField;
export type MetadataValue = string | readonly string[];
export type MetadataDraft = Partial<Record<MetadataField, MetadataValue>>;
export type MetadataUpdate = Partial<Record<MetadataTextField, string>> &
  Partial<Record<MetadataTagField, readonly string[]>>;
export type MetadataLockUpdate = Partial<
  Record<MetadataField | ArtworkField, boolean>
>;
export interface MetadataFieldDefinition {
  id: MetadataField;
  property: keyof Plex.Metadata;
  label: string;
  kind: "text" | "multiline" | "number" | "date" | "tags";
}

const basic: MetadataField[] = ["title", "titleSort", "summary"];
const video: MetadataField[] = [
  ...basic,
  "originalTitle",
  "originallyAvailableAt",
  "year",
  "studio",
  "contentRating",
  "tagline",
];
const videoTags: MetadataField[] = [
  "genre",
  "collection",
  "label",
  "country",
  "director",
  "writer",
  "producer",
  "actor",
];
const musicTags: MetadataField[] = [
  "genre",
  "style",
  "mood",
  "collection",
  "label",
];
const fieldsByType: Record<string, readonly MetadataField[]> = {
  movie: [...video, ...videoTags],
  show: [...video, ...videoTags],
  season: [...basic, "index", "collection", "label"],
  episode: [
    ...video,
    "index",
    "director",
    "writer",
    "producer",
    "actor",
    "label",
  ],
  artist: [...basic, ...musicTags, "country", "similar"],
  album: [...basic, "originallyAvailableAt", "year", "studio", ...musicTags],
  track: [...basic, "originalTitle", "index", "parentIndex", "mood", "label"],
  photo: [...basic, "originallyAvailableAt", "tag", "label"],
  photoalbum: [...basic, "tag", "label"],
  clip: [...basic, "originallyAvailableAt", "tag", "label"],
};

export function supportsMetadataEditing(type: string) {
  return Object.hasOwn(fieldsByType, type);
}

export function metadataFields(type: string): MetadataFieldDefinition[] {
  return (Object.hasOwn(fieldsByType, type) ? fieldsByType[type] : []).map(
    (id) => {
      const tags = metadataTagFields[id as MetadataTagField];
      const [property, defaultLabel, kind] = tags
        ? [...tags, "tags" as const]
        : textFields[id as MetadataTextField];
      const label =
        id === "index"
          ? type === "track"
            ? "Track number"
            : type === "season"
              ? "Season number"
              : "Episode number"
          : id === "originalTitle" && type === "track"
            ? "Track artist"
            : id === "studio" && type === "album"
              ? "Record label"
              : id === "originallyAvailableAt" && type === "photo"
                ? "Date taken"
                : defaultLabel;
      return { id, property, label, kind };
    },
  );
}

export function draftFromMetadata(data: Plex.Metadata): MetadataDraft {
  return Object.fromEntries(
    metadataFields(data.type).map((field) => {
      const value = data[field.property];
      return [
        field.id,
        field.kind === "tags"
          ? Array.isArray(value)
            ? value.flatMap((tag) =>
                typeof tag === "object" &&
                "tag" in tag &&
                typeof tag.tag === "string"
                  ? [tag.tag]
                  : [],
              )
            : []
          : value === undefined || value === null
            ? ""
            : String(value),
      ];
    }),
  );
}

export function normalizeTags(tags: readonly string[]) {
  return [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))];
}

export function sameMetadataValue(
  left: MetadataValue | undefined,
  right: MetadataValue | undefined,
) {
  return Array.isArray(left) && Array.isArray(right)
    ? JSON.stringify(normalizeTags(left).sort()) ===
        JSON.stringify(normalizeTags(right).sort())
    : left === right;
}

export function metadataChanges(
  initial: MetadataDraft,
  draft: MetadataDraft,
): MetadataUpdate {
  return Object.fromEntries(
    Object.entries(draft).flatMap(([field, value]) => {
      if (sameMetadataValue(initial[field as MetadataField], value)) return [];
      const normalized = Array.isArray(value)
        ? normalizeTags(value)
        : field === "title"
          ? String(value).trim()
          : value;
      return sameMetadataValue(initial[field as MetadataField], normalized)
        ? []
        : [[field, normalized]];
    }),
  );
}

export function metadataLocks(data: Plex.Metadata): MetadataLockUpdate {
  return Object.fromEntries(
    (data.Field ?? [])
      .filter((field) => field.locked)
      .map((field) => [field.name, true]),
  );
}

export function metadataDraftErrors(type: string, draft: MetadataDraft) {
  const errors: Partial<Record<MetadataField, string>> = {};
  if (!String(draft.title ?? "").trim()) errors.title = "Title is required.";
  for (const field of metadataFields(type)) {
    const value = draft[field.id];
    if (
      field.kind === "number" &&
      value !== "" &&
      value !== undefined &&
      (!Number.isSafeInteger(Number(value)) ||
        Number(value) < 0 ||
        Number(value) > 9999)
    )
      errors[field.id] = "Enter a whole number from 0 to 9999.";
    if (
      field.kind === "date" &&
      value &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(String(value)) ||
        !Number.isFinite(new Date(String(value)).getTime()) ||
        new Date(String(value)).toISOString().slice(0, 10) !== value)
    )
      errors[field.id] = "Enter a valid date.";
  }
  return errors;
}

export function metadataArtworkLabel(type: MediaItemData["type"]) {
  return ["artist", "album", "track"].includes(type)
    ? "Cover"
    : ["photo", "photoalbum", "episode", "clip"].includes(type)
      ? "Thumbnail"
      : "Poster";
}
