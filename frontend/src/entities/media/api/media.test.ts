import type { Mock } from "vitest";
import {
  plexClient,
} from "features/session/model";
import { publishMediaChange } from "../model/mediaChanges";
import {
  getMediaByGuid,
  getMediaChildren,
  getMediaMetadata,
  setMediaPlayedStatus,
} from "./media";

vi.mock("features/session/model", () => ({
  getActiveServerScope: () => ({ serverId: "server", profileKey: "owner" }),
  plexClient: { get: vi.fn() },
  getXPlexProps: () => ({}),
}));
vi.mock("shared/lib/query", () => ({
  queryBuilder: () => "query",
}));
vi.mock("../model/mediaChanges", () => ({
  publishMediaChange: vi.fn(),
}));

beforeEach(() => vi.clearAllMocks());

it("loads metadata and children from Plex", async () => {
  (plexClient.get as Mock)
    .mockResolvedValueOnce({ MediaContainer: { Metadata: [{ ratingKey: "1" }] } })
    .mockResolvedValueOnce({ MediaContainer: { Metadata: [{ ratingKey: "2" }] } });

  await expect(getMediaMetadata("1")).resolves.toMatchObject({ ratingKey: "1" });
  await expect(getMediaChildren("1")).resolves.toEqual([{ ratingKey: "2" }]);
});

it("only returns a GUID lookup when Plex returned the requested item", async () => {
  (plexClient.get as Mock).mockResolvedValue({
    MediaContainer: { Metadata: [{ guid: "plex://movie/other" }] },
  });

  await expect(getMediaByGuid("plex://movie/1")).resolves.toBeNull();
});

it("publishes a scoped item effect after confirming watched state", async () => {
  (plexClient.get as Mock).mockResolvedValue({});

  await setMediaPlayedStatus(true, "12");

  expect(plexClient.get).toHaveBeenCalledWith("/:/scrobble?query");
  expect(publishMediaChange).toHaveBeenCalledWith({ serverId: "server", profileKey: "owner", kind: "item", effect: "unknown", id: "12" });
});

it("normalizes photo album Directory records without retyping ordinary photos", async () => {
  (plexClient.get as Mock)
    .mockResolvedValueOnce({ MediaContainer: { Directory: [{ ratingKey: "10", type: "photo", title: "Album" }] } })
    .mockResolvedValueOnce({ MediaContainer: { Metadata: [{ ratingKey: "11", type: "photo", title: "Photo" }], Directory: [{ ratingKey: "12", type: "photo", title: "Subalbum" }] } });
  await expect(getMediaMetadata("10")).resolves.toMatchObject({ type: "photoalbum" });
  await expect(getMediaChildren("10")).resolves.toMatchObject([{ type: "photo" }, { type: "photoalbum" }]);
});

it("returns show metadata without treating it as an unplayable API response", async () => {
  const show = { ratingKey: "9", type: "show", title: "Example" };
  vi.mocked(plexClient.get).mockResolvedValue({ MediaContainer: { Metadata: [show] } });
  await expect(getMediaMetadata("9")).resolves.toEqual(show);
});

it("reports an absent item separately from a failed request", async () => {
  vi.mocked(plexClient.get).mockResolvedValue({ MediaContainer: {} });
  await expect(getMediaMetadata("missing")).rejects.toThrow("no longer available");
  const failure = new Error("HTTP 403");
  vi.mocked(plexClient.get).mockRejectedValue(failure);
  await expect(getMediaMetadata("denied")).rejects.toBe(failure);
});

it.each([{}, { MediaContainer: { Metadata: {} } }, { MediaContainer: { Directory: {} } }])("rejects malformed media responses (%j)", async (response) => {
  vi.mocked(plexClient.get).mockResolvedValue(response);
  await expect(getMediaChildren("1")).rejects.toThrow("invalid media response");
});

it("forwards metadata cancellation and encodes the item path", async () => {
  vi.mocked(plexClient.get).mockResolvedValue({ MediaContainer: { Metadata: [{ ratingKey: "1/2" }] } });
  const signal = new AbortController().signal;
  await getMediaMetadata("1/2", signal);
  expect(plexClient.get).toHaveBeenCalledWith("/library/metadata/1%2F2?query", signal);
});
