import {
  draftFromMetadata,
  metadataChanges,
  metadataDraftErrors,
  metadataFields,
  metadataLocks,
  supportsMetadataEditing,
} from "./metadataEditing";

it.each([
  "movie",
  "show",
  "season",
  "episode",
  "artist",
  "album",
  "track",
  "photo",
  "photoalbum",
  "clip",
])("has one field model for supported %s metadata", (type) => {
  expect(supportsMetadataEditing(type)).toBe(true);
  expect(
    metadataFields(type).filter((field) => field.id === "title"),
  ).toHaveLength(1);
});
it.each(["playlist", "constructor", "__proto__", "unknown"])(
  "rejects unsupported %s types",
  (type) => {
    expect(supportsMetadataEditing(type)).toBe(false);
    expect(metadataFields(type)).toEqual([]);
  },
);
it("offers music and photo fields without video-only values", () => {
  expect(metadataFields("album")).toContainEqual(
    expect.objectContaining({ id: "studio", label: "Record label" }),
  );
  expect(metadataFields("track")).toContainEqual(
    expect.objectContaining({ id: "parentIndex", label: "Disc number" }),
  );
  expect(metadataFields("photo")).toContainEqual(
    expect.objectContaining({
      id: "originallyAvailableAt",
      label: "Date taken",
    }),
  );
  expect(
    metadataFields("photo").some((field) => field.id === "contentRating"),
  ).toBe(false);
});
it("keeps untouched tag fields absent from changes and ignores tag ordering and duplicate names", () => {
  const data = {
    type: "movie",
    title: "Movie",
    Genre: [{ tag: "Drama" }, { tag: "Comedy" }],
    Role: [{ tag: "Actor", role: "Character" }],
  } as Plex.Metadata;
  const initial = draftFromMetadata(data);
  expect(
    metadataChanges(initial, {
      ...initial,
      title: " New title ",
      genre: ["Comedy", " Drama ", "Drama"],
    }),
  ).toEqual({ title: "New title" });
  expect(metadataChanges(initial, { ...initial, genre: [] })).toEqual({
    genre: [],
  });
  expect(data.Role?.[0].role).toBe("Character");
});
it("retains sparse locks for artwork and tags", () => {
  expect(
    metadataLocks({
      Field: [
        { name: "thumb", locked: true },
        { name: "genre", locked: true },
        { name: "title", locked: false },
      ],
    } as Plex.Metadata),
  ).toEqual({ thumb: true, genre: true });
});

it("does not normalize unedited values when saving another field", () => {
  const initial = { title: " Movie ", genre: ["Drama"] };
  expect(metadataChanges(initial, { ...initial, genre: ["Comedy"] })).toEqual({
    genre: ["Comedy"],
  });
});
it.each(["2026-02-30", "2026-13-01", "bad", "2026-01-32"])(
  "reports an invalid date %s without throwing",
  (date) => {
    expect(
      metadataDraftErrors("photo", {
        title: "Photo",
        originallyAvailableAt: date,
      }),
    ).toHaveProperty("originallyAvailableAt");
  },
);
it("rejects empty titles and fractional track numbers", () => {
  expect(
    metadataDraftErrors("track", { title: " ", index: "2.5" }),
  ).toMatchObject({ title: expect.any(String), index: expect.any(String) });
  expect(
    metadataDraftErrors("track", {
      title: "Track",
      index: "2",
      parentIndex: "1",
    }),
  ).toEqual({});
});
