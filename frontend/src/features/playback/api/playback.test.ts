import { authedGet } from "features/session/model";
import { getPlaybackMetadata, getTimelineUpdate } from "./playback";

jest.mock("features/session/model", () => ({
  authedGet: jest.fn(),
  authedPost: jest.fn(),
  plexClient: { put: jest.fn() },
  getXPlexProps: () => ({}),
}));

const request = authedGet as jest.Mock;

beforeEach(() => request.mockReset());

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

it("reports progress against the source's Plex session", async () => {
  request.mockResolvedValue({ MediaContainer: {} });
  await getTimelineUpdate(42, 100000, "paused", 7250, "owned-source");
  const url = new URL(request.mock.calls[0][0], "http://plex");
  expect(url.searchParams.get("X-Plex-Session-Identifier")).toBe(
    "owned-source",
  );
  expect(url.searchParams.get("time")).toBe("7250");
});
