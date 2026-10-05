import type { Mock } from "vitest";
import {
  authedGetStrict,
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
  authedGetStrict: vi.fn(),
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
  (authedGetStrict as Mock)
    .mockResolvedValueOnce({ MediaContainer: { Metadata: [{ ratingKey: "1" }] } })
    .mockResolvedValueOnce({ MediaContainer: { Metadata: [{ ratingKey: "2" }] } });

  await expect(getMediaMetadata("1")).resolves.toMatchObject({ ratingKey: "1" });
  await expect(getMediaChildren("1")).resolves.toEqual([{ ratingKey: "2" }]);
});

it("only returns a GUID lookup when Plex returned the requested item", async () => {
  (authedGetStrict as Mock).mockResolvedValue({
    MediaContainer: { Metadata: [{ guid: "plex://movie/other" }] },
  });

  await expect(getMediaByGuid("plex://movie/1")).resolves.toBeNull();
});

it("publishes a scoped item effect after confirming watched state", async () => {
  (authedGetStrict as Mock).mockResolvedValue({});

  await setMediaPlayedStatus(true, "12");

  expect(authedGetStrict).toHaveBeenCalledWith("/:/scrobble?query");
  expect(publishMediaChange).toHaveBeenCalledWith({ serverId: "server", profileKey: "owner", kind: "item", effect: "unknown", id: "12" });
});
