const textFields = {
  title: ["title", "Title", "text"],
  titleSort: ["titleSort", "Sort title", "text"],
  originalTitle: ["originalTitle", "Original title", "text"],
  editionTitle: ["editionTitle", "Edition", "text"],
  originallyAvailableAt: ["originallyAvailableAt", "Release date", "date"],
  year: ["year", "Year", "number"],
  studio: ["studio", "Studio", "text"],
  contentRating: ["contentRating", "Content rating", "text"],
  tagline: ["tagline", "Tagline", "text"],
  summary: ["summary", "Summary", "multiline"],
  index: ["index", "Number", "number"],
  parentIndex: ["parentIndex", "Disc number", "number"],
} as const;

const metadataTagFields = {
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
type MetadataTagField = keyof typeof metadataTagFields;
export const artworkTypes = {
  thumb: { choices: "posters", selection: "poster", label: "Poster" },
  art: { choices: "arts", selection: "art", label: "Background" },
  clearLogo: { choices: "clearLogos", selection: "clearLogo", label: "Logo" },
  squareArt: {
    choices: "squareArts",
    selection: "squareArt",
    label: "Square art",
  },
  banner: { choices: "banners", selection: "banner", label: "Banner" },
} as const;
export type ArtworkField = keyof typeof artworkTypes;
export type MetadataField = MetadataTextField | MetadataTagField;
export type MetadataValue = string | readonly string[];
export type MetadataDraft = Partial<Record<MetadataField, MetadataValue>>;
export type MetadataUpdate = Partial<Record<MetadataTextField, string>> &
  Partial<Record<MetadataTagField, readonly string[]>>;
export type MetadataLockUpdate = Partial<
  Record<MetadataField | ArtworkField, boolean>
>;
interface MetadataActor {
  tag: string;
  role?: string;
}

/** Only the identity, editable fields, associations and locks used by the editor. */
export type MetadataEditingItem = {
  ratingKey: string;
  type: string;
  librarySectionID?: number;
  parentRatingKey?: string;
  grandparentRatingKey?: string;
  parentTitle?: string;
  grandparentTitle?: string;
  Role?: MetadataActor[];
  Field?: { name: string; locked: boolean }[];
} & Partial<
  Record<
    Exclude<MetadataTextField, "year" | "index" | "parentIndex"> | ArtworkField,
    string
  >
> &
  Partial<Record<"year" | "index" | "parentIndex", number>> &
  Partial<
    Record<
      Exclude<(typeof metadataTagFields)[MetadataTagField][0], "Role">,
      { tag: string }[]
    >
  >;

export type MetadataCastSnapshot = Pick<
  MetadataEditingItem,
  "ratingKey" | "Role"
>;

export interface ArtworkOption {
  url: string;
  preview: string;
  selected: boolean;
  provider?: string;
}

export interface MetadataFieldDefinition {
  id: MetadataField;
  property: keyof MetadataEditingItem;
  label: string;
  kind: "text" | "multiline" | "number" | "date" | "tags";
}

const basic: MetadataField[] = ["title", "titleSort"];
const videoDetails: MetadataField[] = [
  "originallyAvailableAt",
  "year",
  "studio",
  "contentRating",
  "tagline",
  "summary",
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
  movie: [
    ...basic,
    "originalTitle",
    "editionTitle",
    ...videoDetails,
    ...videoTags,
  ],
  show: [
    ...basic,
    "originalTitle",
    "editionTitle",
    ...videoDetails,
    ...videoTags,
  ],
  season: [...basic, "index", "summary", "collection", "label"],
  episode: [
    ...basic,
    "originalTitle",
    "index",
    ...videoDetails,
    "director",
    "writer",
    "producer",
    "actor",
    "label",
  ],
  artist: [...basic, "summary", ...musicTags, "country", "similar"],
  album: [
    ...basic,
    "originallyAvailableAt",
    "year",
    "studio",
    "summary",
    ...musicTags,
  ],
  track: [
    ...basic,
    "originalTitle",
    "index",
    "parentIndex",
    "summary",
    "mood",
    "label",
  ],
  photo: [...basic, "originallyAvailableAt", "summary", "tag", "label"],
  photoalbum: [...basic, "summary", "tag", "label"],
  clip: [...basic, "originallyAvailableAt", "summary", "tag", "label"],
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

export function draftFromMetadata(data: MetadataEditingItem): MetadataDraft {
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

export function metadataLocks(
  data: Pick<MetadataEditingItem, "Field">,
): MetadataLockUpdate {
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

export function metadataArtworkLabel(type: string) {
  return ["artist", "album", "track"].includes(type)
    ? "Cover"
    : ["photo", "photoalbum", "episode", "clip"].includes(type)
      ? "Thumbnail"
      : "Poster";
}

function serverAtLeast(version: string | undefined, minimum: number[]) {
  const parts = version
    ?.match(/^(\d+)\.(\d+)\.(\d+)/)
    ?.slice(1)
    .map(Number);
  if (!parts) return false;
  for (let index = 0; index < minimum.length; index++) {
    if (parts[index] !== minimum[index]) return parts[index] > minimum[index];
  }
  return true;
}

export function metadataCapabilities(
  type: string,
  server: Pick<
    Plex.ServerPreferences,
    "version" | "ownerFeatures" | "myPlexSubscription"
  > | null,
) {
  const pass =
    server?.myPlexSubscription ||
    server?.ownerFeatures?.split(",").includes("pass");
  const edition = Boolean(
    pass &&
      serverAtLeast(
        server?.version,
        type === "show" ? [1, 43, 3] : [1, 28, 1],
      ) &&
      ["movie", "show"].includes(type),
  );
  const artwork: ArtworkField[] = ["thumb", "art"];
  if (
    serverAtLeast(server?.version, [1, 43, 0]) &&
    ["movie", "show", "season"].includes(type)
  ) {
    artwork.push("clearLogo", "squareArt");
    if (type !== "movie") artwork.push("banner");
  }
  return { edition, artwork };
}

export interface MetadataParent {
  id: string;
  title: string;
}
export interface MetadataMusicParents {
  artist?: MetadataParent;
  album?: MetadataParent;
}
export function metadataMusicParents(
  data: MetadataEditingItem,
): MetadataMusicParents {
  if (data.type !== "album" && data.type !== "track") return {};
  const track = data.type === "track";
  const artist = track ? data.grandparentRatingKey : data.parentRatingKey;
  const title = track ? data.grandparentTitle : data.parentTitle;
  return {
    artist: artist ? { id: artist, title: title ?? artist } : undefined,
    album:
      track && data.parentRatingKey
        ? {
            id: data.parentRatingKey,
            title: data.parentTitle ?? data.parentRatingKey,
          }
        : undefined,
  };
}
export function metadataParentChanges(
  before: MetadataMusicParents,
  after: MetadataMusicParents,
): MetadataMusicParents {
  return Object.fromEntries(
    Object.entries(after).filter(
      ([key, value]) =>
        value?.id !== before[key as keyof MetadataMusicParents]?.id,
    ),
  );
}
