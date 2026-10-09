import { QueryClient } from "@tanstack/react-query";
import { PlexResponseError } from "shared/api/plexResponse";
import { plexClient } from "features/session/model";
import { mediaMetadataQueryOptions } from "../model/mediaMetadataQuery";
import { readMediaMetadata } from "./mediaMetadata";

vi.mock("features/session/model", () => ({
  plexClient: { get: vi.fn() },
  getXPlexProps: () => ({}),
}));
const movie = { ratingKey: "1", type: "movie" as const, title: "Movie" };

it.each([
  "movie",
  "show",
  "season",
  "episode",
  "clip",
  "artist",
  "album",
  "track",
  "photo",
  "photoalbum",
])("accepts minimal %s metadata without inventing optional values", (type) => {
  const item = { ...movie, type };
  expect(readMediaMetadata(item)).toEqual(item);
});

it("reads files, tracks and flags without requiring presentation or technical details", () => {
  const item = readMediaMetadata({
    ...movie,
    skipChildren: 0,
    Media: [
      {
        Part: [
          {
            key: "/library/parts/2/file.mkv",
            Stream: [
              { streamType: 1, frameRate: 23.976 },
              { streamType: 2, selected: 1 },
              { streamType: 3, default: 0 },
            ],
          },
        ],
      },
    ],
    Field: [{ name: "title", locked: 1 }],
  });
  expect(item.skipChildren).toBe(false);
  expect(item.Media?.[0]?.Part?.[0]?.Stream).toEqual([
    { streamType: 1, frameRate: 23.976 },
    { streamType: 2, selected: true },
    { streamType: 3, default: false },
  ]);
  expect(item.Field).toEqual([{ name: "title", locked: true }]);
  expect(item.Media?.[0]).not.toHaveProperty("videoCodec");
});

it("normalizes XML-derived frame rates and photo albums identified by their children path", () => {
  expect(
    readMediaMetadata({
      ...movie,
      Media: [{ Part: [{ Stream: [{ streamType: 1, frameRate: "23.976" }] }] }],
    }).Media?.[0]?.Part?.[0]?.Stream?.[0].frameRate,
  ).toBe(23.976);
  expect(
    readMediaMetadata({
      ...movie,
      type: "photo",
      key: "/library/metadata/1/children",
    }).type,
  ).toBe("photoalbum");
  expect(
    readMediaMetadata({ ...movie, type: "photo", key: "/library/metadata/1" })
      .type,
  ).toBe("photo");
  expect(
    readMediaMetadata({ ...movie, type: "photo", Media: [{ iso: "200" }] })
      .Media?.[0].iso,
  ).toBe(200);
});

it("projects nested metadata and leaves fields from other media families out", () => {
  const item = readMediaMetadata({
    ...movie,
    type: "show",
    unknown: "untrusted",
    Mood: [{ tag: "Wrong family" }],
    Children: {
      size: 1,
      Metadata: [{ ratingKey: "2", type: "season", title: "Season", index: 1 }],
    },
    OnDeck: { Metadata: { ratingKey: "3", type: "episode", title: "Episode" } },
    Extras: {
      Metadata: [
        { ratingKey: "4", type: "clip", title: "Trailer", extraType: 1 },
      ],
    },
    Related: {
      Hub: [{ title: "Similar", Metadata: [{ ...movie, ratingKey: "5" }] }],
    },
  });
  expect(item).not.toHaveProperty("unknown");
  expect(item).not.toHaveProperty("Mood");
  expect(item.Children?.Metadata?.[0].ratingKey).toBe("2");
  expect(item.OnDeck?.Metadata?.ratingKey).toBe("3");
  expect(item.Extras?.Metadata?.[0].extraType).toBe(1);
  expect(item.Related?.Hub?.[0]).toEqual({
    Metadata: [{ ...movie, ratingKey: "5" }],
  });
});

it.each([
  null,
  [],
  {},
  { ...movie, ratingKey: "" },
  { ...movie, title: null },
  { ...movie, type: "folder" },
  { ...movie, duration: -1 },
  { ...movie, duration: 1.5 },
  { ...movie, rating: NaN },
  { ...movie, year: "2026" },
  { ...movie, Media: {} },
  { ...movie, Media: [{ Part: null }] },
  { ...movie, Media: [{ Part: [{ size: "100" }] }] },
  { ...movie, Media: [{ Part: [{ Stream: {} }] }] },
  {
    ...movie,
    Media: [{ Part: [{ Stream: [{ streamType: 2, selected: "yes" }] }] }],
  },
  { ...movie, Media: [{ Part: [{ Stream: [{ streamType: "2" }] }] }] },
  {
    ...movie,
    Media: [{ Part: [{ Stream: [{ streamType: 1, frameRate: "23x" }] }] }],
  },
  {
    ...movie,
    Media: [{ Part: [{ Stream: [{ streamType: 1, frameRate: 0 }] }] }],
  },
  { ...movie, Role: [{ tag: null }] },
  { ...movie, Genre: ["Action"] },
  { ...movie, Field: [{ name: "title", locked: "false" }] },
  { ...movie, Children: { Metadata: [{ ...movie, ratingKey: null }] } },
  { ...movie, OnDeck: { Metadata: [] } },
  { ...movie, Related: { Hub: {} } },
  {
    ...movie,
    Marker: [{ type: "intro", startTimeOffset: 2000, endTimeOffset: 1000 }],
  },
])("rejects malformed fields before publishing metadata (%j)", (value) => {
  expect(() => readMediaMetadata(value)).toThrow(PlexResponseError);
});

it("rejects an unexpected identity and reports the failing field without its value", () => {
  expect(() => readMediaMetadata(movie, "2")).toThrow(PlexResponseError);
  expect(() =>
    readMediaMetadata({
      ...movie,
      Media: [
        { Part: [{ Stream: [{ streamType: 1, codec: { token: "secret" } }] }] },
      ],
    }),
  ).toThrow("Media.Part.Stream.codec");
});

it("preserves last valid Query data when a refreshed response is malformed", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const options = mediaMetadataQueryOptions(
    { serverId: "server", profileKey: "owner" },
    "1",
  );
  client.setQueryData(options.queryKey, movie);
  vi.mocked(plexClient.get).mockResolvedValue({
    MediaContainer: {
      Metadata: [{ ...movie, Media: [{ Part: [{ Stream: "invalid" }] }] }],
    },
  });
  try {
    await expect(
      client.fetchQuery({ ...options, staleTime: 0 }),
    ).rejects.toThrow(PlexResponseError);
    expect(client.getQueryData(options.queryKey)).toEqual(movie);
    expect(client.getQueryState(options.queryKey)?.status).toBe("error");
  } finally {
    client.clear();
  }
});
