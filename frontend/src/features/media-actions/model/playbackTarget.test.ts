import {
  getMediaByGuid,
  getMediaChildren,
  getMediaMetadata,
} from "entities/media/model";
import { resolvePlaybackTarget } from "./playbackTarget";

jest.mock("entities/media/model", () => ({
  getMediaByGuid: jest.fn(),
  getMediaChildren: jest.fn(),
  getMediaMetadata: jest.fn(),
}));

beforeEach(() => jest.clearAllMocks());

it("uses the item directly for a local movie", async () => {
  await expect(
    resolvePlaybackTarget({
      ratingKey: "42",
      guid: "plex://movie/1",
      type: "movie",
      title: "Film",
      viewOffset: 1200,
    }),
  ).resolves.toMatchObject({ path: "/watch/42?t=1200" });
  expect(getMediaMetadata).not.toHaveBeenCalled();
});

it("resolves a Discover item to its local server item", async () => {
  (getMediaByGuid as jest.Mock).mockResolvedValue(null);

  await expect(
    resolvePlaybackTarget(
      {
        ratingKey: "remote",
        guid: "plex://movie/1",
        type: "movie",
        title: "Film",
      },
      true,
    ),
  ).resolves.toMatchObject({ path: null, message: expect.stringContaining("not available") });
});

it("selects On Deck or the first episode for a show", async () => {
  (getMediaMetadata as jest.Mock)
    .mockResolvedValueOnce({
      OnDeck: { Metadata: { ratingKey: "episode-2", type: "episode" } },
    })
    .mockResolvedValueOnce({
      Children: { Metadata: [{ ratingKey: "season-1" }] },
    });
  (getMediaChildren as jest.Mock).mockResolvedValue([
    { ratingKey: "episode-1", type: "episode" },
  ]);
  const show = {
    ratingKey: "show-1",
    guid: "plex://show/1",
    type: "show" as const,
    title: "Show",
  };

  await expect(resolvePlaybackTarget(show)).resolves.toMatchObject({
    path: "/watch/episode-2",
  });
  await expect(resolvePlaybackTarget(show)).resolves.toMatchObject({
    path: "/watch/episode-1",
  });
});
