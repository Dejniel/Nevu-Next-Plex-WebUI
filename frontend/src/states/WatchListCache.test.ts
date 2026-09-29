import { PlexTv } from "../plex/plextv";
import { useWatchListCache } from "./WatchListCache";

jest.mock("../plex/plextv", () => ({
  PlexTv: { getWatchlist: jest.fn() },
}));

beforeEach(() => {
  jest.resetAllMocks();
  useWatchListCache.getState().reset();
});

it("ignores a watchlist response from a reset profile", async () => {
  let resolveRequest!: (items: Plex.Metadata[]) => void;
  (PlexTv.getWatchlist as jest.Mock).mockReturnValue(
    new Promise((resolve) => {
      resolveRequest = resolve;
    }),
  );

  const load = useWatchListCache.getState().loadWatchListCache();
  useWatchListCache.getState().reset();
  resolveRequest([{ ratingKey: "old" } as Plex.Metadata]);
  await load;

  expect(useWatchListCache.getState().watchListCache).toEqual([]);
});
