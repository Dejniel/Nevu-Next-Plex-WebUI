import { authedGet } from "features/session/model";
import { getPlaybackMetadata, getStreamProps } from "./playback";

jest.mock("features/session/model", () => ({
  authedGet: jest.fn(),
  authedPost: jest.fn(),
  authedPut: jest.fn(),
  getXPlexProps: () => ({}),
}));

const request = authedGet as jest.Mock;

beforeEach(() => request.mockReset());

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
  request.mockResolvedValue({
    MediaContainer: { Metadata: [show] },
  } as never);

  await expect(getPlaybackMetadata("9")).resolves.toBe(show);
});

it("returns null for an empty metadata response", async () => {
  request.mockResolvedValue({
    MediaContainer: {},
  } as never);

  await expect(getPlaybackMetadata("missing")).resolves.toBeNull();
});
