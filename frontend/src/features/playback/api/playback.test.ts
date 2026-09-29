import * as plexRequests from "plex/QuickFunctions";
import { getPlaybackMetadata, getStreamProps } from "./playback";

afterEach(() => jest.restoreAllMocks());

it("passes the selected Plex media and part indexes to the transcoder", () => {
  const props = getStreamProps("123", {
    maxVideoBitrate: 8000,
    mediaIndex: 2,
    partIndex: 1,
  });

  expect(props).toMatchObject({
    path: "/library/metadata/123",
    mediaIndex: 2,
    partIndex: 1,
  });
});

it("returns metadata without filtering non-playable parent types", async () => {
  const show = { ratingKey: "9", type: "show", title: "Example" };
  jest.spyOn(plexRequests, "authedGet").mockResolvedValue({
    MediaContainer: { Metadata: [show] },
  } as never);

  await expect(getPlaybackMetadata("9")).resolves.toBe(show);
});

it("returns null for an empty metadata response", async () => {
  jest.spyOn(plexRequests, "authedGet").mockResolvedValue({
    MediaContainer: {},
  } as never);

  await expect(getPlaybackMetadata("missing")).resolves.toBeNull();
});
