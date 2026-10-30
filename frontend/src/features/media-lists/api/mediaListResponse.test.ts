import { PlexResponseError } from "shared/api/plexResponse";
import {
  readListEntry,
  readListSummary,
  readSingleList,
} from "./mediaListResponse";

const movie = { ratingKey: "8", title: "Movie", type: "movie" };
const playlist = { ...movie, type: "playlist", playlistType: "video" };
const response = (Metadata: unknown[], fields = {}) => ({
  MediaContainer: { size: Metadata.length, Metadata, ...fields },
});

it("reads video, music and photo summaries with explicit boolean and count semantics", () => {
  for (const playlistType of ["video", "audio", "photo"])
    expect(
      readListSummary(
        { ...playlist, playlistType, smart: 0, leafCount: 3 },
        "playlist",
      ),
    ).toMatchObject({ id: "8", playlistType, smart: false, count: 3 });
  expect(
    readListSummary(
      { ...movie, type: "collection", childCount: 4, smart: 1 },
      "collection",
      7,
    ),
  ).toMatchObject({
    kind: "collection",
    count: 4,
    smart: true,
    libraryID: "7",
  });
  expect(readListSummary(playlist, "playlist")).toMatchObject({
    count: 0,
    smart: false,
    summary: "",
  });
});

it.each([
  null,
  { ...playlist, ratingKey: "cloud-id" },
  { ...playlist, title: null },
  { ...playlist, playlistType: "future" },
  { ...playlist, smart: "0" },
  { ...playlist, leafCount: -1 },
  { ...playlist, leafCount: 0.5 },
  { ...playlist, librarySectionID: "7" },
  { ...playlist, type: "movie" },
])("rejects unusable summaries: %#", (value) => {
  expect(() => readListSummary(value, "playlist")).toThrow(PlexResponseError);
});

it("requires exactly the requested list before exposing its editing capabilities", () => {
  expect(readSingleList(response([playlist]), "playlist", "8")).toMatchObject({
    id: "8",
  });
  for (const value of [
    response([]),
    response([playlist, playlist]),
    response([playlist], { size: 0 }),
    response([{ ...playlist, ratingKey: "9" }]),
  ])
    expect(() => readSingleList(value, "playlist", "8")).toThrow(
      PlexResponseError,
    );
});

it("uses canonical media decoding and keeps the playlist occurrence outside metadata", () => {
  const entry = readListEntry(
    { ...movie, playlistItemID: 100, addedAt: -100, viewCount: 1 },
    14,
    "playlist",
    7,
    "local",
  );
  expect(entry).toMatchObject({
    supported: true,
    position: 14,
    playlistItemID: "100",
    item: { ...movie, addedAt: -100, viewCount: 1, librarySectionID: 7 },
  });
  expect(entry.item).not.toHaveProperty("playlistItemID");
  expect(readListEntry(movie, 0, "collection").item).not.toHaveProperty(
    "librarySectionID",
  );
  expect(() =>
    readListEntry({ ...movie, Media: "broken" }, 0, "playlist"),
  ).toThrow(PlexResponseError);
});

it("keeps foreign and unsupported rows in place without decoding them as local playable media", () => {
  for (const row of [
    { ...movie, type: "future", Media: "foreign schema" },
    {
      ...movie,
      sourceURI: "server://other/library/metadata/8",
      Media: "foreign schema",
    },
    { ...movie, sourceURI: "invalid" },
  ]) {
    const entry = readListEntry(
      { ...row, playlistItemID: 100 },
      14,
      "playlist",
      7,
      "local",
    );
    expect(entry).toEqual({
      kind: "media",
      supported: false,
      position: 14,
      playlistItemID: "100",
      item: { ratingKey: "8", title: "Movie", type: row.type },
    });
  }
  expect(
    readListEntry(
      { ...movie, sourceURI: "server://local/library/metadata/8" },
      0,
      "playlist",
      7,
      "local",
    ).supported,
  ).toBe(true);
});

it.each([0, -1, 1.5, "80"])(
  "rejects invalid playlist occurrence identifiers: %j",
  (playlistItemID) => {
    expect(() =>
      readListEntry({ ...movie, playlistItemID }, 0, "playlist"),
    ).toThrow(PlexResponseError);
  },
);
