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
    ratingKey: "42",
    type: "movie",
    title: "Movie",
    Genre: [{ tag: "Drama" }, { tag: "Comedy" }],
    Role: [{ tag: "Actor", role: "Character" }],
  };
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
    }),
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

it("limits editions and additional artwork by media type and server capabilities", async () => {
  const { metadataCapabilities } = await import("./metadataEditing");
  const server = {
    version: "1.43.4.10903-test",
    ownerFeatures: "pass,collections",
    myPlexSubscription: false,
  };
  expect(metadataCapabilities("show", server)).toMatchObject({
    edition: true,
    artwork: ["thumb", "art", "clearLogo", "squareArt", "banner"],
  });
  expect(
    metadataCapabilities("movie", { ...server, ownerFeatures: "" }).edition,
  ).toBe(false);
  expect(
    metadataCapabilities("show", { ...server, version: "1.42.0" }).edition,
  ).toBe(false);
  expect(
    metadataCapabilities("movie", { ...server, version: "1.42.0" }),
  ).toEqual({ edition: true, artwork: ["thumb", "art"] });
  expect(metadataCapabilities("album", server)).toEqual({
    edition: false,
    artwork: ["thumb", "art"],
  });
});

it("separates music relationships from ordinary text and sends only changed parent identities", async () => {
  const { metadataMusicParents, metadataParentChanges } = await import(
    "./metadataEditing"
  );
  const initial = metadataMusicParents({
    ratingKey: "42",
    type: "track",
    parentRatingKey: "5",
    parentTitle: "Album",
    grandparentRatingKey: "3",
    grandparentTitle: "Artist",
  });
  expect(initial).toEqual({
    artist: { id: "3", title: "Artist" },
    album: { id: "5", title: "Album" },
  });
  expect(
    metadataParentChanges(initial, {
      artist: { id: "3", title: "Renamed" },
      album: { id: "6", title: "Other" },
    }),
  ).toEqual({ album: { id: "6", title: "Other" } });
});
