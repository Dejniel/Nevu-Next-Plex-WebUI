import { focusManager, notifyManager } from "@tanstack/react-query";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useAuthSession } from "features/session/model";
import { useUserSettings } from "features/settings/model";
import { serverQueryClient as client } from "shared/api/queryClient";
import { addToWatchlist, getWatchlist, removeFromWatchlist } from "../api/watchlist";
import { useWatchlist, useWatchlistAction, watchlistQueryKey } from "./watchlistQuery";

vi.mock("../api/watchlist", () => ({
  addToWatchlist: vi.fn(),
  getWatchlist: vi.fn(),
  removeFromWatchlist: vi.fn(),
}));
beforeAll(() => notifyManager.setScheduler(queueMicrotask));
afterAll(() => notifyManager.setScheduler((callback) => setTimeout(callback, 0)));
const movie = (id: string) =>
  ({ guid: `plex://movie/${id}`, ratingKey: id, type: "movie", title: id }) as Plex.Metadata;
const target = movie("added");
const read = vi.mocked(getWatchlist);
const add = vi.mocked(addToWatchlist);
const remove = vi.mocked(removeFromWatchlist);
let root: Root;
let data: ReturnType<typeof useWatchlist>;
let action: ReturnType<typeof useWatchlistAction>;
let other: ReturnType<typeof useWatchlistAction>;
function Harness() {
  data = useWatchlist();
  action = useWatchlistAction(target);
  other = useWatchlistAction(movie("other"));
  return null;
}
const render = async () => {
  await act(async () => root.render(<Harness />));
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((finish) => {
    resolve = finish;
  });
  return { resolve, promise };
}
beforeEach(() => {
  vi.resetAllMocks();
  client.clear();
  client.mount();
  focusManager.setFocused(true);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  useUserSettings.setState({ profileKey: "owner:1" });
  useAuthSession.setState({ status: "ready", revision: 1 });
  read.mockResolvedValue([]);
  add.mockResolvedValue(undefined);
  remove.mockResolvedValue(undefined);
  root = createRoot(document.createElement("div"));
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.unmount();
  client.clear();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  focusManager.setFocused(undefined);
});

it("shares a pending cloud read between the screen and several membership controls", async () => {
  const pending = deferred<Plex.Metadata[]>();
  read.mockReturnValue(pending.promise);
  await render();
  expect(read).toHaveBeenCalledTimes(1);
  expect(data.isPending).toBe(true);
  expect(action.loading).toBe(true);
  await act(async () => pending.resolve([target]));
  expect(action.selected).toBe(true);
  expect(data.data).toEqual([target]);
  expect(client.getQueryData(watchlistQueryKey("owner:1"))).toEqual([target]);
});

it("publishes membership only after successful writes and shares pending state", async () => {
  await render();
  const pending = deferred<void>();
  add.mockReturnValueOnce(pending.promise);
  let writing!: Promise<void>;
  await act(async () => {
    writing = action.toggle();
  });
  expect(action.loading).toBe(true);
  expect(data.data).toEqual([]);
  await act(async () => {
    pending.resolve();
    await writing;
  });
  expect(action.selected).toBe(true);
  expect(data.data).toEqual([target]);
  await act(async () => {
    await action.toggle();
  });
  expect(remove).toHaveBeenCalledWith(target.guid);
  expect(data.data).toEqual([]);
});

it("does not send duplicate concurrent writes for the same title", async () => {
  await render();
  const pending = deferred<void>();
  add.mockReturnValue(pending.promise);
  let writing!: Promise<void>;
  await act(async () => {
    writing = action.toggle();
    await action.toggle();
  });
  expect(add).toHaveBeenCalledTimes(1);
  await act(async () => {
    pending.resolve();
    await writing;
  });
});

it("keeps independent confirmed writes when different titles finish out of order", async () => {
  await render();
  const first = deferred<void>();
  const second = deferred<void>();
  add.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  let one!: Promise<void>;
  let two!: Promise<void>;
  await act(async () => {
    one = action.toggle();
    two = other.toggle();
  });
  await act(async () => {
    second.resolve();
    await two;
  });
  await act(async () => {
    first.resolve();
    await one;
  });
  expect(data.data?.map((item) => item.guid)).toEqual([target.guid, movie("other").guid]);
});

it("shares a cold read and rechecks duplicate writes after that read completes", async () => {
  const pending = deferred<Plex.Metadata[]>();
  const writing = deferred<void>();
  read.mockReturnValueOnce(pending.promise);
  add.mockReturnValueOnce(writing.promise);
  await render();
  let first!: Promise<void>;
  let second!: Promise<void>;
  await act(async () => {
    first = action.toggle();
    second = action.toggle();
  });
  await act(async () => pending.resolve([]));
  expect(read).toHaveBeenCalledTimes(1);
  expect(add).toHaveBeenCalledTimes(1);
  await act(async () => {
    writing.resolve();
    await Promise.all([first, second]);
  });
  expect(data.data).toEqual([target]);
});

it.each([false, true])(
  "cancels an old read before it can restore membership, initially selected=%s",
  async (selected) => {
    read.mockResolvedValueOnce(selected ? [target, movie("kept")] : [movie("kept")]);
    await render();
    const pending = deferred<Plex.Metadata[]>();
    read.mockReturnValueOnce(pending.promise);
    let refreshing!: ReturnType<typeof data.refetch>;
    await act(async () => {
      refreshing = data.refetch();
    });
    const signal = read.mock.lastCall![0]!;
    await act(async () => {
      await action.toggle();
    });
    expect(signal.aborted).toBe(true);
    await act(async () => {
      pending.resolve(selected ? [target, movie("kept")] : [movie("kept")]);
      await refreshing;
    });
    expect(action.selected).toBe(!selected);
    expect(data.data?.some((item) => item.guid === movie("kept").guid)).toBe(true);
  },
);

it("cancels a read started during a pending write", async () => {
  await render();
  const writing = deferred<void>();
  add.mockReturnValueOnce(writing.promise);
  let mutation!: Promise<void>;
  let refreshing!: ReturnType<typeof data.refetch>;
  await act(async () => {
    mutation = action.toggle();
  });
  const pending = deferred<Plex.Metadata[]>();
  read.mockReturnValueOnce(pending.promise);
  await act(async () => {
    refreshing = data.refetch();
  });
  await act(async () => {
    writing.resolve();
    await mutation;
  });
  await act(async () => {
    pending.resolve([]);
    await refreshing;
  });
  expect(data.data).toEqual([target]);
});

it("does not change another profile after a previous profile's write finishes", async () => {
  await render();
  const pending = deferred<void>();
  add.mockReturnValueOnce(pending.promise);
  let writing!: Promise<void>;
  await act(async () => {
    writing = action.toggle();
  });
  await act(async () => {
    client.clear();
    useAuthSession.setState({ revision: 2 });
    useUserSettings.setState({ profileKey: "owner:2" });
  });
  await act(async () => {
    pending.resolve();
    await writing;
  });
  expect(data.data).toEqual([]);
  expect(client.getQueryData(watchlistQueryKey("owner:1"))).toBeUndefined();
});

it("ignores an old cloud response after changing profiles and aborts its transport", async () => {
  const pending = deferred<Plex.Metadata[]>();
  read.mockReturnValueOnce(pending.promise);
  await render();
  const signal = read.mock.calls[0][0]!;
  await act(async () => useUserSettings.setState({ profileKey: "owner:2" }));
  expect(signal.aborted).toBe(true);
  await act(async () => pending.resolve([target]));
  expect(data.data).toEqual([]);
});

it("keeps a full cached list after a failed write", async () => {
  read.mockResolvedValueOnce([movie("kept")]);
  await render();
  add.mockRejectedValueOnce(new Error("denied"));
  await act(async () => {
    await expect(action.toggle()).rejects.toThrow("denied");
  });
  expect(data.data).toEqual([movie("kept")]);
  expect(action.selected).toBe(false);
});

it("retains loaded empty data during background errors and allows Retry", async () => {
  await render();
  read.mockRejectedValueOnce(new Error("offline"));
  await act(async () => {
    await data.refetch();
  });
  expect(data.data).toEqual([]);
  expect(data.isPending).toBe(false);
  expect(data.isError).toBe(true);
  read.mockResolvedValueOnce([target]);
  await act(async () => {
    await data.refetch();
  });
  expect(data.isError).toBe(false);
  expect(action.selected).toBe(true);
});

it("skips a fresh re-entry and uses native visible interval and focus recovery", async () => {
  vi.useFakeTimers();
  await render();
  await render();
  expect(read).toHaveBeenCalledTimes(1);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(60_000);
  });
  expect(read).toHaveBeenCalledTimes(2);
  focusManager.setFocused(false);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(60_000);
  });
  expect(read).toHaveBeenCalledTimes(2);
  await act(async () => {
    focusManager.setFocused(true);
  });
  expect(read).toHaveBeenCalledTimes(3);
});

it("does not read or mutate without a profile", async () => {
  useUserSettings.setState({ profileKey: null });
  await render();
  await act(async () => {
    await action.toggle();
  });
  expect(read).not.toHaveBeenCalled();
  expect(add).not.toHaveBeenCalled();
  expect(action.loading).toBe(false);
});
