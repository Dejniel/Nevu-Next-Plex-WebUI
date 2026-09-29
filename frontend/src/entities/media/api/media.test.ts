import {
  authedGet,
  authedGetStrict,
} from "features/session/model";
import { invalidateLibraryCache } from "shared/lib/libraryCache";
import {
  getMediaByGuid,
  getMediaChildren,
  getMediaMetadata,
  setMediaPlayedStatus,
} from "./media";

jest.mock("features/session/model", () => ({
  authedGet: jest.fn(),
  authedGetStrict: jest.fn(),
  getXPlexProps: () => ({}),
}));
jest.mock("shared/lib/query", () => ({
  queryBuilder: () => "query",
}));
jest.mock("shared/lib/libraryCache", () => ({
  invalidateLibraryCache: jest.fn(),
}));

beforeEach(() => jest.clearAllMocks());

it("loads metadata and children from Plex", async () => {
  (authedGetStrict as jest.Mock)
    .mockResolvedValueOnce({ MediaContainer: { Metadata: [{ ratingKey: "1" }] } })
    .mockResolvedValueOnce({ MediaContainer: { Metadata: [{ ratingKey: "2" }] } });

  await expect(getMediaMetadata("1")).resolves.toMatchObject({ ratingKey: "1" });
  await expect(getMediaChildren("1")).resolves.toEqual([{ ratingKey: "2" }]);
});

it("only returns a GUID lookup when Plex returned the requested item", async () => {
  (authedGetStrict as jest.Mock).mockResolvedValue({
    MediaContainer: { Metadata: [{ guid: "plex://movie/other" }] },
  });

  await expect(getMediaByGuid("plex://movie/1")).resolves.toBeNull();
});

it("updates watched state and invalidates library data", async () => {
  (authedGet as jest.Mock).mockResolvedValue({});

  await setMediaPlayedStatus(true, "12");

  expect(authedGet).toHaveBeenCalledWith("/:/scrobble?query");
  expect(invalidateLibraryCache).toHaveBeenCalled();
});
