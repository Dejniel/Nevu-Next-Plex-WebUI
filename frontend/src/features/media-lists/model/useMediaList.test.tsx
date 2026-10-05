import type { Mock } from "vitest";
import { serverQueryClient } from "shared/api/queryClient";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useUserSettings } from "features/settings/model";
import { createMediaListSource } from "../api/mediaLists";
import { type MediaListPage, type MediaListQuery } from "./mediaLists";
import { useMediaList } from "./useMediaList";
import { invalidateMediaLists } from "./listChanges";

vi.mock("../api/mediaLists", () => ({ createMediaListSource: vi.fn() }));
const source = createMediaListSource as Mock;
const page = vi.fn();
const summary = vi.fn();
let root: Root;
let query: MediaListQuery;
let state: ReturnType<typeof useMediaList>;
function Harness() {
  state = useMediaList(query);
  return null;
}
async function render() {
  await act(async () => root.render(<Harness />));
}
const items = (offset: number, length = 100) =>
  Array.from({ length }, (_, index) => ({
    kind: "media" as const,
    position: offset + index,
    supported: true,
    item: { ratingKey: "repeated", type: "movie" } as Plex.Metadata,
  }));

beforeEach(() => {
  vi.resetAllMocks();
  serverQueryClient.clear();
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  useUserSettings.setState({ profileKey: "owner:1" });
  query = { kind: "playlist", id: "20" };
  root = createRoot(document.createElement("div"));
  summary.mockResolvedValue(null);
  page.mockImplementation(async (offset: number) => ({
    offset,
    total: 500,
    items: items(offset),
  }));
  source.mockReturnValue({ page, summary });
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.useRealTimers();
});

it("starts the first page itself and deduplicates overlapping grid demand", async () => {
  await render();
  expect(page).toHaveBeenCalledWith(0, 100);
  await act(async () => {
    state.requestRange({ start: 30, end: 110 });
    state.requestRange({ start: 90, end: 130 });
  });
  expect(page).toHaveBeenCalledTimes(2);
  expect(state.items.size).toBe(200);
  expect(state.items.get(99)).toMatchObject({ position: 99 });
  expect(state.items.get(100)).toMatchObject({ position: 100 });
});

it("ignores an old response after changing the list or profile", async () => {
  let resolveOld!: (result: MediaListPage) => void;
  page.mockReturnValueOnce(
    new Promise((resolve) => {
      resolveOld = resolve;
    }),
  );
  await render();
  query = { kind: "playlist", id: "21" };
  await act(async () => useUserSettings.setState({ profileKey: "owner:2" }));
  await render();
  expect(source).toHaveBeenLastCalledWith(query, expect.any(AbortSignal));
  await act(async () =>
    resolveOld({ offset: 0, total: 1, items: items(0, 1) }),
  );
  expect(state.total).toBe(500);
  expect(state.items.size).toBe(100);
});

it("retries a failed page without discarding already loaded positions", async () => {
  await render();
  page.mockRejectedValueOnce(new Error("offline"));
  await act(async () => state.requestRange({ start: 100, end: 150 }));
  expect(state.error).toBe("offline");
  expect(state.items.size).toBe(100);
  await act(async () => state.retry());
  expect(state.error).toBeNull();
  expect(state.items.size).toBe(200);
});

it("limits concurrent requests and stops requesting past the end", async () => {
  await render();
  const completions: Array<() => void> = [];
  page.mockImplementation(
    (offset: number) =>
      new Promise((resolve) =>
        completions.push(() =>
          resolve({ offset, total: 500, items: items(offset) }),
        ),
      ),
  );
  await act(async () => state.requestRange({ start: 100, end: 499 }));
  expect(page).toHaveBeenCalledTimes(3);
  await act(async () => completions.shift()!());
  expect(page).toHaveBeenCalledTimes(4);
  await act(async () => {
    completions.splice(0).forEach((finish) => finish());
  });
  await act(async () => {
    completions.splice(0).forEach((finish) => finish());
  });
  expect(state.items.size).toBe(500);
  await act(async () => state.requestRange({ start: 500, end: 699 }));
  expect(page).toHaveBeenCalledTimes(5);
});

it("finishes an empty list and retries an unavailable source", async () => {
  source.mockImplementation(() => {
    throw new Error("missing session");
  });
  await render();
  expect(state.loading).toBe(false);
  expect(state.error).toBe("missing session");
  source.mockReturnValue({ page, summary });
  page.mockResolvedValueOnce({ offset: 0, total: 0, items: [] });
  await act(async () => state.retry());
  expect(state.error).toBeNull();
  expect(state.loading).toBe(false);
  expect(state.total).toBe(0);
});

it("does not issue list requests without a profile and aborts old windows", async () => {
  await render();
  const pending = deferred<MediaListPage>();
  page.mockReturnValueOnce(pending.promise);
  await act(async () => state.requestRange({ start: 100, end: 199 }));
  const signal = source.mock.lastCall![1] as AbortSignal;
  await act(async () => useUserSettings.setState({ profileKey: null }));
  expect(signal.aborted).toBe(true);
  expect(state.loading).toBe(false);
  expect(state.items.size).toBe(0);
  expect(page).toHaveBeenCalledTimes(2);
});

it("refreshes a changed list for its profile without refreshing unrelated lists", async () => {
  vi.useFakeTimers();
  await render();
  const changed = (extra = {}) =>
    invalidateMediaLists({
      kind: "playlist",
      id: "20",
      libraryID: "2",
      profileKey: "owner:1",
      ...extra,
    });
  await act(async () => {
    changed({ id: "21" });
    changed({ profileKey: "owner:2" });
    changed({ kind: "collection" });
  });
  expect(page).toHaveBeenCalledTimes(1);
  await act(async () => changed());
  await act(async () => vi.advanceTimersByTime(500));
  expect(page).toHaveBeenCalledTimes(2);
  vi.useRealTimers();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((finish) => {
    resolve = finish;
  });
  return { promise, resolve };
}

it("keeps the grid visible and replaces only the current window atomically after reordering", async () => {
  await render();
  await act(async () => state.requestRange({ start: 100, end: 199 }));
  await act(async () => state.requestRange({ start: 300, end: 399 }));
  const first = deferred<MediaListPage>();
  const last = deferred<MediaListPage>();
  page.mockImplementation((offset: number) =>
    offset === 0 ? first.promise : last.promise,
  );
  const oldItems = [...state.items];
  await act(async () => {
    state.refresh();
    state.refresh();
  });
  expect(state.loading).toBe(false);
  expect([...state.items]).toEqual(oldItems);
  expect(page).toHaveBeenCalledTimes(4);
  await act(async () =>
    first.resolve({ offset: 0, total: 400, items: items(0) }),
  );
  expect([...state.items]).toEqual(oldItems);
  await act(async () =>
    last.resolve({ offset: 300, total: 400, items: items(300) }),
  );
  expect(state.items.size).toBe(200);
  expect(state.items.has(100)).toBe(false);
  expect(state.items.get(300)?.kind).toBe("media");
  expect(state.total).toBe(400);
});

it("retains cached positions on a failed background refresh and retries the complete window", async () => {
  await render();
  await act(async () => state.requestRange({ start: 100, end: 199 }));
  const before = [...state.items];
  page.mockImplementation(async (offset: number) => {
    if (offset === 100) throw new Error("offline");
    return { offset, total: 500, items: items(offset) };
  });
  await act(async () => state.refresh());
  expect(state.error).toBe("offline");
  expect(state.loading).toBe(false);
  expect([...state.items]).toEqual(before);
  page.mockImplementation(async (offset: number) => ({
    offset,
    total: 200,
    items: items(offset),
  }));
  await act(async () => state.retry());
  expect(state.error).toBeNull();
  expect(state.total).toBe(200);
  expect(state.items.size).toBe(200);
});

it("ignores a pre-refresh page and a replacement completed after switching profiles", async () => {
  await render();
  const oldPage = deferred<MediaListPage>();
  page.mockReturnValueOnce(oldPage.promise);
  await act(async () => state.requestRange({ start: 100, end: 199 }));
  const replacement = deferred<MediaListPage>();
  page.mockReturnValueOnce(replacement.promise);
  await act(async () => state.refresh());
  const signal = source.mock.lastCall![1] as AbortSignal;
  await act(async () => useUserSettings.setState({ profileKey: "owner:2" }));
  expect(signal.aborted).toBe(true);
  await act(async () => {
    oldPage.resolve({ offset: 100, total: 1, items: items(100, 1) });
    replacement.resolve({ offset: 0, total: 1, items: items(0, 1) });
  });
  expect(state.total).toBe(500);
  expect(state.items.size).toBe(100);
});

it("recreates a mounted list after the session cache is cleared", async () => {
  await render();
  page.mockResolvedValueOnce({ offset: 0, total: 1, items: items(0, 1) });
  await act(async () => serverQueryClient.clear());
  expect(state.total).toBe(1);
  expect(state.items.size).toBe(1);
  expect(state.loading).toBe(false);
});
