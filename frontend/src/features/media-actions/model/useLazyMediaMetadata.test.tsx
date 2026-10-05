import type { Mock } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { getMediaMetadata, type MediaItemData } from "entities/media/model";
import {
  StaleMediaMetadataRequestError,
  useLazyMediaMetadata,
} from "./useLazyMediaMetadata";

vi.mock("entities/media/model", async (original) => ({ ...await original<typeof import("entities/media/model")>(), getMediaMetadata: vi.fn() }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const movie = { ratingKey: "1", type: "movie", title: "A movie" } as Plex.Metadata;
const fullMovie = { ...movie, summary: "Full metadata" };
let item: MediaItemData;
let state: ReturnType<typeof useLazyMediaMetadata>;
let root: Root;
let element: HTMLDivElement;

function Harness() {
  state = useLazyMediaMetadata(item);
  return null;
}

async function renderCard() {
  await act(async () => root.render(<Harness />));
}

beforeEach(() => {
  vi.resetAllMocks();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  item = movie;
  element = document.createElement("div");
  document.body.appendChild(element);
  root = createRoot(element);
  (getMediaMetadata as Mock).mockResolvedValue(fullMovie);
});

afterEach(async () => {
  await act(async () => root.unmount());
  element.remove();
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
  expect(getMediaMetadata).toHaveBeenCalledWith("1");
});

it("shares one guarded request between concurrent callers", async () => {
  const request = deferred<Plex.Metadata>();
  (getMediaMetadata as Mock).mockReturnValue(request.promise);
  await renderCard();
  let first!: Promise<Plex.Metadata>;
  let second!: Promise<Plex.Metadata>;
  act(() => {
    first = state.load();
    second = state.load();
  });

  expect(state.status).toBe("loading");
  expect(first).toBe(second);
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
    expect(state.load()).toBe(first);
    await expect(first).rejects.toBe(failure);
  });
  expect(state.status).toBe("failed");
  expect(state.data).toBeNull();

  await act(async () => {
    const retry = state.load();
    expect(state.load()).toBe(retry);
    await expect(retry).resolves.toBe(fullMovie);
  });
  expect(state.status).toBe("loaded");
  expect(getMediaMetadata).toHaveBeenCalledTimes(2);
});

it("invalidates loaded metadata and fetches the new match on demand", async () => {
  await renderCard();
  await act(async () => { await state.load(); });
  const matched = { ...fullMovie, guid: "plex://movie/new", title: "New match" };
  (getMediaMetadata as Mock).mockResolvedValue(matched);

  act(() => state.invalidate());
  expect(state.data).toBeNull();
  expect(state.status).toBe("idle");
  expect(getMediaMetadata).toHaveBeenCalledTimes(1);

  await act(async () => { await state.load(); });
  expect(state.data).toBe(matched);
  expect(getMediaMetadata).toHaveBeenCalledTimes(2);
});

it("rejects an invalidated response for every caller without replacing fresh data", async () => {
  const oldRequest = deferred<Plex.Metadata>();
  (getMediaMetadata as Mock).mockReturnValueOnce(oldRequest.promise);
  await renderCard();
  let firstResult!: Promise<Plex.Metadata | Error>;
  let secondResult!: Promise<Plex.Metadata | Error>;
  act(() => {
    firstResult = state.load().catch((error) => error);
    secondResult = state.load().catch((error) => error);
    state.invalidate();
  });
  const unmatched = { ...fullMovie, guid: "local://1", title: "Unmatched" };
  (getMediaMetadata as Mock).mockResolvedValue(unmatched);
  await act(async () => { await state.load(); });
  await act(async () => oldRequest.resolve(fullMovie));

  expect(await firstResult).toBeInstanceOf(StaleMediaMetadataRequestError);
  expect(await secondResult).toBeInstanceOf(StaleMediaMetadataRequestError);
  expect(state.data).toBe(unmatched);
  expect(state.status).toBe("loaded");
});

it("does not let an old failure clear or fail a newer pending request", async () => {
  const oldRequest = deferred<Plex.Metadata>();
  const newRequest = deferred<Plex.Metadata>();
  (getMediaMetadata as Mock)
    .mockReturnValueOnce(oldRequest.promise)
    .mockReturnValueOnce(newRequest.promise);
  await renderCard();
  let oldResult!: Promise<Plex.Metadata | Error>;
  let newPromise!: Promise<Plex.Metadata>;
  act(() => {
    oldResult = state.load().catch((error) => error);
    state.invalidate();
    newPromise = state.load();
  });
  await act(async () => oldRequest.reject(new Error("Old failure")));

  expect(await oldResult).toBeInstanceOf(StaleMediaMetadataRequestError);
  expect(state.status).toBe("loading");
  expect(state.load()).toBe(newPromise);
  expect(getMediaMetadata).toHaveBeenCalledTimes(2);
  await act(async () => newRequest.resolve(fullMovie));
  expect(state.status).toBe("loaded");
});

it("rejects all old callers when the card changes while loading", async () => {
  const oldRequest = deferred<Plex.Metadata>();
  (getMediaMetadata as Mock).mockReturnValueOnce(oldRequest.promise);
  await renderCard();
  let firstResult!: Promise<Plex.Metadata | Error>;
  let secondResult!: Promise<Plex.Metadata | Error>;
  act(() => {
    firstResult = state.load().catch((error) => error);
    secondResult = state.load().catch((error) => error);
  });
  item = { ...movie, ratingKey: "2", title: "Another movie" };
  await renderCard();
  expect(state.data).toBeNull();
  expect(state.status).toBe("idle");
  const nextMetadata = { ...item, summary: "Another movie's metadata" } as Plex.Metadata;
  (getMediaMetadata as Mock).mockResolvedValue(nextMetadata);
  await act(async () => { await state.load(); });
  await act(async () => oldRequest.resolve(fullMovie));

  expect(await firstResult).toBeInstanceOf(StaleMediaMetadataRequestError);
  expect(await secondResult).toBeInstanceOf(StaleMediaMetadataRequestError);
  expect(state.data).toBe(nextMetadata);
  expect(getMediaMetadata).toHaveBeenLastCalledWith("2");
});

it("discards the cache when refreshed props contain the same Plex ID", async () => {
  await renderCard();
  await act(async () => { await state.load(); });
  item = { ...movie, title: "Refreshed title" };
  await renderCard();

  expect(state.data).toBeNull();
  expect(state.status).toBe("idle");
  await act(async () => { await state.load(); });
  expect(getMediaMetadata).toHaveBeenCalledTimes(2);
});

it("prevents delayed actions for an old item from touching the new cache", async () => {
  await renderCard();
  const oldActions = state;
  item = { ...movie, ratingKey: "2" };
  await renderCard();
  const currentMetadata = { ...fullMovie, ratingKey: "2" };
  (getMediaMetadata as Mock).mockResolvedValue(currentMetadata);
  await act(async () => { await state.load(); });

  await expect(oldActions.load()).rejects.toBeInstanceOf(StaleMediaMetadataRequestError);
  expect(() => oldActions.invalidate()).toThrow(StaleMediaMetadataRequestError);
  expect(() => oldActions.update(fullMovie)).toThrow(StaleMediaMetadataRequestError);
  expect(state.data).toBe(currentMetadata);
  expect(getMediaMetadata).toHaveBeenCalledTimes(1);
});

it("keeps a local edit cached and prevents a pending response from undoing it", async () => {
  const request = deferred<Plex.Metadata>();
  (getMediaMetadata as Mock).mockReturnValue(request.promise);
  await renderCard();
  let pendingResult!: Promise<Plex.Metadata | Error>;
  act(() => { pendingResult = state.load().catch((error) => error); });
  const edited = { ...fullMovie, title: "Edited title" };
  act(() => state.update(edited));
  await act(async () => request.resolve(fullMovie));

  expect(await pendingResult).toBeInstanceOf(StaleMediaMetadataRequestError);
  expect(state.data).toBe(edited);
  expect(state.status).toBe("loaded");
  await expect(state.load()).resolves.toBe(edited);
  expect(getMediaMetadata).toHaveBeenCalledTimes(1);
});

it("rejects a pending result after unmounting", async () => {
  const request = deferred<Plex.Metadata>();
  (getMediaMetadata as Mock).mockReturnValue(request.promise);
  await renderCard();
  let result!: Promise<Plex.Metadata | Error>;
  act(() => { result = state.load().catch((error) => error); });
  await act(async () => root.render(null));
  await act(async () => request.resolve(fullMovie));

  expect(await result).toBeInstanceOf(StaleMediaMetadataRequestError);
});
