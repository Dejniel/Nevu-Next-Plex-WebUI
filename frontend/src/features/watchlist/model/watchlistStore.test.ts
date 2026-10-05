import type { Mock } from "vitest";
import { serverQueryClient } from "shared/api/queryClient";
import { useUserSettings } from "features/settings/model";
import {
  addToWatchlist,
  getWatchlist,
  removeFromWatchlist,
} from "../api/watchlist";
import { useWatchlist, watchlistQueryKey } from "./watchlistStore";
const seed = (items: Plex.Metadata[]) => serverQueryClient.setQueryData(watchlistQueryKey(), { items, loaded: true });

vi.mock("../api/watchlist", () => ({
  addToWatchlist: vi.fn(),
  getWatchlist: vi.fn(),
  removeFromWatchlist: vi.fn(),
}));

const item = (guid: string) => ({ guid, ratingKey: guid }) as Plex.Metadata;

beforeEach(() => {
  vi.resetAllMocks();
  useUserSettings.setState({ profileKey: "owner:1" });
  useWatchlist.getState().reset();
});

it("ignores a load response after the active profile is reset", async () => {
  let resolveRequest!: (items: Plex.Metadata[]) => void;
  (getWatchlist as Mock).mockReturnValue(
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
  (addToWatchlist as Mock).mockReturnValue(
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
  (getWatchlist as Mock).mockReturnValue(
    new Promise((resolve) => {
      resolveLoad = resolve;
    }),
  );
  (addToWatchlist as Mock).mockReturnValue(
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
  (addToWatchlist as Mock).mockResolvedValue(undefined);
  (removeFromWatchlist as Mock).mockResolvedValue(undefined);
  const movie = item("plex://movie/1");

  await useWatchlist.getState().add(movie);
  await useWatchlist.getState().add(movie);
  expect(useWatchlist.getState().items).toEqual([movie]);
  expect(addToWatchlist).toHaveBeenCalledTimes(1);

  await useWatchlist.getState().remove(movie.guid);
  expect(useWatchlist.getState().items).toEqual([]);
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((success, failure) => {
    resolve = success;
    reject = failure;
  });
  return { promise, resolve, reject };
}

it("shares a pending refresh and merges new titles from both the response and mutations", async () => {
  const request = deferred<Plex.Metadata[]>();
  (getWatchlist as Mock).mockReturnValue(request.promise);
  (addToWatchlist as Mock).mockResolvedValue(undefined);
  const first = useWatchlist.getState().load();
  const duplicate = useWatchlist.getState().load();
  expect(useWatchlist.getState().status).toBe("loading");
  await useWatchlist.getState().add(item("added"));
  request.resolve([item("fetched")]);
  await Promise.all([first, duplicate]);
  expect(useWatchlist.getState().items.map((entry) => entry.guid)).toEqual([
    "added",
    "fetched",
  ]);
  expect(getWatchlist).toHaveBeenCalledTimes(1);
  expect(useWatchlist.getState().status).toBe("ready");
});

it("keeps successful removals when an older refresh includes that title", async () => {
  const request = deferred<Plex.Metadata[]>();
  (getWatchlist as Mock).mockReturnValue(request.promise);
  (removeFromWatchlist as Mock).mockResolvedValue(undefined);
  seed([item("removed"), item("kept")]);
  const load = useWatchlist.getState().load();
  await useWatchlist.getState().remove("removed");
  request.resolve([item("removed"), item("kept"), item("new")]);
  await load;
  expect(useWatchlist.getState().items.map((entry) => entry.guid)).toEqual([
    "kept",
    "new",
  ]);
});

it("retains cached items after a failure and allows retry without an unhandled rejection", async () => {
  seed([item("cached")]);
  (getWatchlist as Mock)
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce([item("updated")]);
  await expect(useWatchlist.getState().load()).resolves.toBeUndefined();
  expect(useWatchlist.getState()).toMatchObject({
    status: "error",
    items: [item("cached")],
    error: expect.any(String),
  });
  await useWatchlist.getState().load();
  expect(useWatchlist.getState()).toMatchObject({
    status: "ready",
    error: null,
    items: [item("updated")],
  });
});

it("aborts the previous profile's refresh without clearing the next profile's pending request", async () => {
  const old = deferred<Plex.Metadata[]>();
  const next = deferred<Plex.Metadata[]>();
  (getWatchlist as Mock)
    .mockReturnValueOnce(old.promise)
    .mockReturnValueOnce(next.promise);
  const oldLoad = useWatchlist.getState().load();
  const oldSignal = (getWatchlist as Mock).mock.calls[0][0] as AbortSignal;
  useWatchlist.getState().reset();
  expect(oldSignal.aborted).toBe(true);
  const nextLoad = useWatchlist.getState().load();
  old.resolve([item("old")]);
  await oldLoad;
  const sharedNext = useWatchlist.getState().load();
  expect(getWatchlist).toHaveBeenCalledTimes(2);
  expect(useWatchlist.getState().items).toEqual([]);
  next.resolve([item("next")]);
  await Promise.all([nextLoad, sharedNext]);
  expect(useWatchlist.getState().items).toEqual([item("next")]);
});

it("does not remove a title from the next profile after an old removal finishes", async () => {
  const request = deferred<void>();
  (removeFromWatchlist as Mock).mockReturnValue(request.promise);
  seed([item("same")]);
  const removal = useWatchlist.getState().remove("same");
  useWatchlist.getState().reset();
  seed([item("same")]);
  request.resolve();
  await removal;
  expect(useWatchlist.getState().items).toEqual([item("same")]);
});

it("skips a recent successful load on re-entry but permits forced refresh and resets freshness with the profile", async () => {
  (getWatchlist as Mock).mockResolvedValue([]);
  await useWatchlist.getState().load();
  await useWatchlist.getState().load(30_000);
  expect(getWatchlist).toHaveBeenCalledTimes(1);
  await useWatchlist.getState().load();
  expect(getWatchlist).toHaveBeenCalledTimes(2);
  useWatchlist.getState().reset();
  await useWatchlist.getState().load(30_000);
  expect(getWatchlist).toHaveBeenCalledTimes(3);
});

it("keeps an already loaded empty state during a background refresh", async () => {
  (getWatchlist as Mock).mockResolvedValueOnce([]);
  await useWatchlist.getState().load();
  const request = deferred<Plex.Metadata[]>();
  (getWatchlist as Mock).mockReturnValueOnce(request.promise);
  const pending = useWatchlist.getState().load();
  expect(useWatchlist.getState()).toMatchObject({
    items: [],
    hasLoaded: true,
    status: "loading",
  });
  request.resolve([]);
  await pending;
});
