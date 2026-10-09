import type { Mock } from "vitest";
import { plexClient } from "features/session/model";
import { getMediaByGuid, getMediaChildren, getMediaMetadata } from "./media";

vi.mock("features/session/model", () => ({
  plexClient: { get: vi.fn() },
  getXPlexProps: () => ({}),
}));
vi.mock("shared/lib/query", () => ({
  queryBuilder: () => "query",
}));

beforeEach(() => vi.clearAllMocks());

it("loads metadata and children from Plex", async () => {
  (plexClient.get as Mock)
    .mockResolvedValueOnce({
      MediaContainer: {
        Metadata: [{ ratingKey: "1", type: "movie", title: "Movie" }],
      },
    })
    .mockResolvedValueOnce({
      MediaContainer: {
        Metadata: [{ ratingKey: "2", type: "episode", title: "Episode" }],
      },
    });

  await expect(getMediaMetadata("1")).resolves.toMatchObject({
    ratingKey: "1",
  });
  await expect(getMediaChildren("1")).resolves.toMatchObject([
    { ratingKey: "2", type: "episode", title: "Episode" },
  ]);
});

it("only returns a GUID lookup when Plex returned the requested item", async () => {
  (plexClient.get as Mock).mockResolvedValue({
    MediaContainer: {
      Metadata: [
        {
          ratingKey: "3",
          type: "movie",
          title: "Other",
          guid: "plex://movie/other",
        },
      ],
    },
  });

  await expect(getMediaByGuid("plex://movie/1")).resolves.toBeNull();
});

it("normalizes photo album Directory records without retyping ordinary photos", async () => {
  (plexClient.get as Mock)
    .mockResolvedValueOnce({
      MediaContainer: {
        Directory: [{ ratingKey: "10", type: "photo", title: "Album" }],
      },
    })
    .mockResolvedValueOnce({
      MediaContainer: {
        Metadata: [{ ratingKey: "11", type: "photo", title: "Photo" }],
        Directory: [{ ratingKey: "12", type: "photo", title: "Subalbum" }],
      },
    });
  await expect(getMediaMetadata("10")).resolves.toMatchObject({
    type: "photoalbum",
  });
  await expect(getMediaChildren("10")).resolves.toMatchObject([
    { type: "photo" },
    { type: "photoalbum" },
  ]);
});

it("returns show metadata without treating it as an unplayable API response", async () => {
  const show = { ratingKey: "9", type: "show", title: "Example" };
  vi.mocked(plexClient.get).mockResolvedValue({
    MediaContainer: { Metadata: [show] },
  });
  await expect(getMediaMetadata("9")).resolves.toEqual(show);
});

it("reports an absent item separately from a failed request", async () => {
  vi.mocked(plexClient.get).mockResolvedValue({ MediaContainer: {} });
  await expect(getMediaMetadata("missing")).rejects.toThrow(
    "no longer available",
  );
  const failure = new Error("HTTP 403");
  vi.mocked(plexClient.get).mockRejectedValue(failure);
  await expect(getMediaMetadata("denied")).rejects.toBe(failure);
});

it.each([
  {},
  { MediaContainer: { Metadata: {} } },
  { MediaContainer: { Directory: {} } },
])("rejects malformed media responses (%j)", async (response) => {
  vi.mocked(plexClient.get).mockResolvedValue(response);
  await expect(getMediaChildren("1")).rejects.toThrow("invalid media metadata");
});

it("forwards metadata cancellation and encodes the item path", async () => {
  vi.mocked(plexClient.get).mockResolvedValue({
    MediaContainer: {
      Metadata: [{ ratingKey: "1/2", type: "movie", title: "Movie" }],
    },
  });
  const signal = new AbortController().signal;
  await getMediaMetadata("1/2", signal);
  expect(plexClient.get).toHaveBeenCalledWith(
    "/library/metadata/1%2F2?query",
    signal,
  );
});

it("does not confuse a show's All episodes link with season metadata", async () => {
  const season = {
    ratingKey: "2",
    type: "season",
    title: "Season 1",
    index: 1,
  };
  vi.mocked(plexClient.get).mockResolvedValue({
    MediaContainer: {
      Metadata: [season],
      Directory: [
        { key: "/library/metadata/1/allLeaves", title: "All episodes" },
      ],
    },
  });
  await expect(getMediaChildren("1")).resolves.toEqual([season]);
});

it("fails the whole children read if an actual media row lacks its identity", async () => {
  vi.mocked(plexClient.get).mockResolvedValue({
    MediaContainer: {
      Metadata: [{ ratingKey: "2", type: "season", title: "Season" }],
      Directory: [{ type: "photo", title: "Broken album" }],
    },
  });
  await expect(getMediaChildren("1")).rejects.toThrow("invalid media metadata");
});
