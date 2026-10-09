import { notifyManager, useQuery } from "@tanstack/react-query";
import { serverQueryClient } from "shared/api/queryClient";
import type { Mock } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  type MediaMetadata,
  applyMediaMetadataChanges,
  getMediaMetadata,
  mediaMetadataQueryOptions,
  type MediaItemData,
} from "entities/media/model";
import {
  StaleMediaMetadataRequestError,
  useLazyMediaMetadata,
} from "./useLazyMediaMetadata";

vi.mock("entities/media/api/media", async (original) => ({
  ...(await original<typeof import("entities/media/api/media")>()),
  getMediaMetadata: vi.fn(),
}));
const scope = { serverId: "server", profileKey: "owner" };
vi.mock("features/session/model", async (original) => ({
  ...(await original<typeof import("features/session/model")>()),
  useActiveServerScope: () => scope,
}));
beforeAll(() => notifyManager.setScheduler(queueMicrotask));
afterAll(() =>
  notifyManager.setScheduler((callback) => setTimeout(callback, 0)),
);

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const movie = {
  ratingKey: "1",
  type: "movie",
  title: "A movie",
} as MediaMetadata;
const fullMovie = { ...movie, summary: "Full metadata" };
let item: MediaItemData;
let state: ReturnType<typeof useLazyMediaMetadata>;
let root: Root;
let element: HTMLDivElement;

function invalidate() {
  return applyMediaMetadataChanges(serverQueryClient, [
    {
      change: { ...scope, kind: "item", id: item.ratingKey, effect: "unknown" },
    },
  ]);
}

function Harness() {
  state = useLazyMediaMetadata(item);
  return null;
}

async function renderCard() {
  await act(async () => root.render(<Harness />));
}

beforeEach(() => {
  vi.resetAllMocks();
  serverQueryClient.clear();
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  item = movie;
  element = document.createElement("div");
  document.body.appendChild(element);
  root = createRoot(element);
  (getMediaMetadata as Mock).mockResolvedValue(fullMovie);
});

afterEach(async () => {
  await act(async () => root.unmount());
  element.remove();
  serverQueryClient.clear();
});

it("loads lazily and reuses cached metadata even before React rerenders", async () => {
  await renderCard();
  expect(state.status).toBe("idle");
  expect(state.data).toBeNull();
  expect(getMediaMetadata).not.toHaveBeenCalled();

  await act(async () => {
    expect(await state.load()).toBe(fullMovie);
    expect(await state.load()).toBe(fullMovie);
  });

  expect(state.status).toBe("loaded");
  expect(state.data).toBe(fullMovie);
  await renderCard();
  await expect(state.load()).resolves.toBe(fullMovie);
  expect(getMediaMetadata).toHaveBeenCalledTimes(1);
  expect(getMediaMetadata).toHaveBeenCalledWith("1", expect.any(AbortSignal));
});

it("shares one guarded request between concurrent callers", async () => {
  const request = deferred<MediaMetadata>();
  (getMediaMetadata as Mock).mockReturnValue(request.promise);
  await renderCard();
  let first!: Promise<MediaMetadata>;
  let second!: Promise<MediaMetadata>;
  await act(async () => {
    first = state.load();
    second = state.load();
  });

  expect(state.status).toBe("loading");
  expect(getMediaMetadata).toHaveBeenCalledTimes(1);
  await act(async () => request.resolve(fullMovie));
  await expect(first).resolves.toBe(fullMovie);
  await expect(second).resolves.toBe(fullMovie);
  expect(state.data).toBe(fullMovie);
});

it("allows retrying a failed request and shares the retry", async () => {
  const failure = new Error("Plex unavailable");
  (getMediaMetadata as Mock).mockRejectedValueOnce(failure);
  await renderCard();
  await act(async () => {
    const first = state.load();
    const second = state.load();
    await expect(second).rejects.toBe(failure);
    await expect(first).rejects.toBe(failure);
  });
  expect(state.status).toBe("failed");
  expect(state.data).toBeNull();

  await act(async () => {
    const retry = state.load();
    await expect(state.load()).resolves.toEqual(fullMovie);
    await expect(retry).resolves.toBe(fullMovie);
  });
  expect(state.status).toBe("loaded");
  expect(getMediaMetadata).toHaveBeenCalledTimes(2);
});

it("invalidates loaded metadata and fetches the new match on demand", async () => {
  await renderCard();
  await act(async () => {
    await state.load();
  });
  const matched = {
    ...fullMovie,
    guid: "plex://movie/new",
    title: "New match",
  };
  (getMediaMetadata as Mock).mockResolvedValue(matched);

  await act(async () => invalidate());
  expect(
    serverQueryClient.getQueryState(
      mediaMetadataQueryOptions(scope, "1").queryKey,
    )?.isInvalidated,
  ).toBe(true);
  expect(getMediaMetadata).toHaveBeenCalledTimes(1);

  await act(async () => {
    await state.load();
  });
  expect(state.data).toEqual(matched);
  expect(getMediaMetadata).toHaveBeenCalledTimes(2);
});

it("rejects an invalidated response for every caller without replacing fresh data", async () => {
  const oldRequest = deferred<MediaMetadata>();
  (getMediaMetadata as Mock).mockReturnValueOnce(oldRequest.promise);
  await renderCard();
  let firstResult!: Promise<MediaMetadata | Error>;
  let secondResult!: Promise<MediaMetadata | Error>;
  act(() => {
    firstResult = state.load().catch((error) => error);
    secondResult = state.load().catch((error) => error);
    void invalidate();
  });
  const unmatched = { ...fullMovie, guid: "local://1", title: "Unmatched" };
  (getMediaMetadata as Mock).mockResolvedValue(unmatched);
  await act(async () => {
    await state.load();
  });
  await act(async () => oldRequest.resolve(fullMovie));

  expect(await firstResult).toBeInstanceOf(StaleMediaMetadataRequestError);
  expect(await secondResult).toBeInstanceOf(StaleMediaMetadataRequestError);
  expect(state.data).toEqual(unmatched);
  expect(state.status).toBe("loaded");
});

it("does not let an old failure clear or fail a newer pending request", async () => {
  const oldRequest = deferred<MediaMetadata>();
  const newRequest = deferred<MediaMetadata>();
  (getMediaMetadata as Mock)
    .mockReturnValueOnce(oldRequest.promise)
    .mockReturnValueOnce(newRequest.promise);
  await renderCard();
  let oldResult!: Promise<MediaMetadata | Error>;
  let newPromise!: Promise<MediaMetadata>;
  act(() => {
    oldResult = state.load().catch((error) => error);
    void invalidate();
    newPromise = state.load();
  });
  await act(async () => oldRequest.reject(new Error("Old failure")));

  expect(await oldResult).toBeInstanceOf(StaleMediaMetadataRequestError);
  expect(state.status).toBe("loading");
  const sharedNewPromise = state.load();
  expect(getMediaMetadata).toHaveBeenCalledTimes(2);
  await act(async () => newRequest.resolve(fullMovie));
  await expect(sharedNewPromise).resolves.toEqual(fullMovie);
  await expect(newPromise).resolves.toEqual(fullMovie);
  expect(state.status).toBe("loaded");
});

it("rejects all old callers when the card changes while loading", async () => {
  const oldRequest = deferred<MediaMetadata>();
  (getMediaMetadata as Mock).mockReturnValueOnce(oldRequest.promise);
  await renderCard();
  let firstResult!: Promise<MediaMetadata | Error>;
  let secondResult!: Promise<MediaMetadata | Error>;
  act(() => {
    firstResult = state.load().catch((error) => error);
    secondResult = state.load().catch((error) => error);
  });
  item = { ...movie, ratingKey: "2", title: "Another movie" };
  await renderCard();
  expect(state.data).toBeNull();
  expect(state.status).toBe("idle");
  const nextMetadata = {
    ...item,
    summary: "Another movie's metadata",
  } as MediaMetadata;
  (getMediaMetadata as Mock).mockResolvedValue(nextMetadata);
  await act(async () => {
    await state.load();
  });
  await act(async () => oldRequest.resolve(fullMovie));

  expect(await firstResult).toBeInstanceOf(StaleMediaMetadataRequestError);
  expect(await secondResult).toBeInstanceOf(StaleMediaMetadataRequestError);
  expect(state.data).toBe(nextMetadata);
  expect(getMediaMetadata).toHaveBeenLastCalledWith(
    "2",
    expect.any(AbortSignal),
  );
});

it("keeps the shared cache when new props refer to the same Plex ID", async () => {
  await renderCard();
  await act(async () => {
    await state.load();
  });
  item = { ...movie, title: "Refreshed title" };
  await renderCard();
  await act(async () => {
    await state.load();
  });
  expect(state.data).toEqual(fullMovie);
  expect(getMediaMetadata).toHaveBeenCalledTimes(1);
});

it("prevents delayed actions for an old item from touching the new cache", async () => {
  await renderCard();
  const oldActions = state;
  item = { ...movie, ratingKey: "2" };
  await renderCard();
  const currentMetadata = { ...fullMovie, ratingKey: "2" };
  (getMediaMetadata as Mock).mockResolvedValue(currentMetadata);
  await act(async () => {
    await state.load();
  });

  await expect(oldActions.load()).rejects.toBeInstanceOf(
    StaleMediaMetadataRequestError,
  );
  expect(() => oldActions.update(fullMovie)).toThrow(
    StaleMediaMetadataRequestError,
  );
  expect(state.data).toBe(currentMetadata);
  expect(getMediaMetadata).toHaveBeenCalledTimes(1);
});

it("returns confirmed metadata to waiting actions and ignores the old transport response", async () => {
  const request = deferred<MediaMetadata>();
  (getMediaMetadata as Mock).mockReturnValue(request.promise);
  await renderCard();
  let pendingResult!: Promise<MediaMetadata | Error>;
  act(() => {
    pendingResult = state.load().catch((error) => error);
  });
  const edited = { ...fullMovie, title: "Edited title" };
  act(() => state.update(edited));
  await act(async () => request.resolve(fullMovie));

  expect(await pendingResult).toEqual(edited);
  expect(state.data).toEqual(edited);
  expect(state.status).toBe("loaded");
  await expect(state.load()).resolves.toEqual(edited);
  expect(getMediaMetadata).toHaveBeenCalledTimes(1);
});

it("rejects a pending result after unmounting", async () => {
  const request = deferred<MediaMetadata>();
  (getMediaMetadata as Mock).mockReturnValue(request.promise);
  await renderCard();
  let result!: Promise<MediaMetadata | Error>;
  act(() => {
    result = state.load().catch((error) => error);
  });
  await act(async () => root.render(null));
  await act(async () => request.resolve(fullMovie));

  expect(await result).toBeInstanceOf(StaleMediaMetadataRequestError);
});

it("shares metadata and confirmed edits with a second card and the title details query", async () => {
  let peer!: ReturnType<typeof useLazyMediaMetadata>;
  let details!: MediaMetadata | undefined;
  function Peer() {
    peer = useLazyMediaMetadata(movie);
    return null;
  }
  function Details() {
    details = useQuery(
      mediaMetadataQueryOptions(scope, "1"),
      serverQueryClient,
    ).data;
    return null;
  }
  await act(async () =>
    root.render(
      <>
        <Harness />
        <Peer />
        <Details />
      </>,
    ),
  );
  await act(async () => {
    await Promise.all([state.load(), peer.load()]);
  });
  expect(getMediaMetadata).toHaveBeenCalledTimes(1);
  expect(details).toEqual(fullMovie);
  const edited = { ...fullMovie, title: "Edited" };
  await act(async () => state.update(edited));
  expect(peer.data).toEqual(edited);
  expect(details).toEqual(edited);
});

it("rejects an invalidated warm read instead of exposing its reverted stale metadata", async () => {
  await renderCard();
  await act(async () => {
    await state.load();
    void invalidate();
  });
  const request = deferred<MediaMetadata>();
  vi.mocked(getMediaMetadata).mockReturnValueOnce(request.promise);
  let result!: Promise<MediaMetadata | Error>;
  await act(async () => {
    result = state.load().catch((error) => error);
    void invalidate();
  });
  await act(async () => request.resolve(fullMovie));
  expect(await result).toBeInstanceOf(StaleMediaMetadataRequestError);
  expect(
    serverQueryClient.getQueryState(
      mediaMetadataQueryOptions(scope, "1").queryKey,
    )?.isInvalidated,
  ).toBe(true);
});
