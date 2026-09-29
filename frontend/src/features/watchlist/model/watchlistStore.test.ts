import {
  addToWatchlist,
  getWatchlist,
  removeFromWatchlist,
} from "../api/watchlist";
import { useWatchlist } from "./watchlistStore";

jest.mock("../api/watchlist", () => ({
  addToWatchlist: jest.fn(),
  getWatchlist: jest.fn(),
  removeFromWatchlist: jest.fn(),
}));

const item = (guid: string) => ({ guid, ratingKey: guid } as Plex.Metadata);

beforeEach(() => {
  jest.resetAllMocks();
  useWatchlist.getState().reset();
});

it("ignores a load response after the active profile is reset", async () => {
  let resolveRequest!: (items: Plex.Metadata[]) => void;
  (getWatchlist as jest.Mock).mockReturnValue(
    new Promise((resolve) => {
      resolveRequest = resolve;
    }),
  );

  const load = useWatchlist.getState().load();
  useWatchlist.getState().reset();
  resolveRequest([item("plex://movie/old")]);
  await load;

  expect(useWatchlist.getState().items).toEqual([]);
});

it("does not update the next profile after an old mutation finishes", async () => {
  let finishAdd!: () => void;
  (addToWatchlist as jest.Mock).mockReturnValue(
    new Promise<void>((resolve) => {
      finishAdd = resolve;
    }),
  );

  const add = useWatchlist.getState().add(item("plex://movie/old"));
  useWatchlist.getState().reset();
  finishAdd();
  await add;

  expect(useWatchlist.getState().items).toEqual([]);
});

it("does not let an overlapping refresh overwrite a completed mutation", async () => {
  let resolveLoad!: (items: Plex.Metadata[]) => void;
  let finishAdd!: () => void;
  (getWatchlist as jest.Mock).mockReturnValue(
    new Promise((resolve) => {
      resolveLoad = resolve;
    }),
  );
  (addToWatchlist as jest.Mock).mockReturnValue(
    new Promise<void>((resolve) => {
      finishAdd = resolve;
    }),
  );
  const movie = item("plex://movie/1");

  const add = useWatchlist.getState().add(movie);
  const load = useWatchlist.getState().load();
  finishAdd();
  await add;
  resolveLoad([]);
  await load;

  expect(useWatchlist.getState().items).toEqual([movie]);
});

it("updates items only after successful mutations", async () => {
  (addToWatchlist as jest.Mock).mockResolvedValue(undefined);
  (removeFromWatchlist as jest.Mock).mockResolvedValue(undefined);
  const movie = item("plex://movie/1");

  await useWatchlist.getState().add(movie);
  await useWatchlist.getState().add(movie);
  expect(useWatchlist.getState().items).toEqual([movie]);
  expect(addToWatchlist).toHaveBeenCalledTimes(1);

  await useWatchlist.getState().remove(movie.guid);
  expect(useWatchlist.getState().items).toEqual([]);
});
