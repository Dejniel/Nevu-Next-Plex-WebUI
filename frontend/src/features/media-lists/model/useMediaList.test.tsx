import { notifyManager } from "@tanstack/react-query";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useServerSession } from "features/session/model";
import { useUserSettings } from "features/settings/model";
import { serverQueryClient as client } from "shared/api/queryClient";
import { createMediaListSource } from "../api/mediaLists";
import { listPageOptions, mediaListWindowKey } from "./listPages";
import { applyMediaListChanges } from "./listSync";
import { useMediaList } from "./useMediaList";
import type { MediaListPage, MediaListQuery } from "./mediaLists";
import type { LibraryCardDto } from "@nevu/contracts";

vi.mock("../api/mediaLists", () => ({ createMediaListSource: vi.fn() }));
beforeAll(() => notifyManager.setScheduler(queueMicrotask));
afterAll(() => notifyManager.setScheduler((callback) => setTimeout(callback, 0)));
const scope = { serverId: "server", profileKey: "owner:1" };
const source = vi.mocked(createMediaListSource);
const page = vi.fn();
const summary = vi.fn();
const metadata = {
  ratingKey: "3",
  guid: "plex://movie/3",
  type: "movie",
  title: "Old",
  librarySectionID: 1,
} as Plex.Metadata;
const records = (offset: number, length = 100) =>
  Array.from({ length }, (_, index) => ({
    kind: "media" as const,
    position: offset + index,
    supported: true,
    playlistItemID: String(1000 + offset + index),
    item: metadata,
  }));
const response = (offset: number, total = 500): MediaListPage => ({
  offset,
  total,
  items: records(offset, Math.min(100, total - offset)),
});
let root: Root;
let query: MediaListQuery;
let state: ReturnType<typeof useMediaList>;
function Harness() {
  state = useMediaList(query);
  return null;
}
const render = async () => {
  await act(async () => root.render(<Harness />));
};
const demand = async (start: number, end = start + 99) => {
  await act(async () => state.requestRange({ start, end, visibleStart: start, visibleEnd: end }));
};
const refresh = () =>
  client.invalidateQueries({ queryKey: mediaListWindowKey(scope, query), exact: true });
const changed = (extra = {}) =>
  applyMediaListChanges(client, [
    {
      change: {
        ...scope,
        kind: "list",
        listKind: "playlist",
        id: "20",
        ...extra,
      },
    },
  ]);
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((finish) => {
    resolve = finish;
  });
  return { promise, resolve };
}
function abortable<T>(promise: Promise<T>, signal: AbortSignal) {
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  client.clear();
  useServerSession.setState({
    server: { machineIdentifier: scope.serverId } as Plex.ServerPreferences,
  });
  useUserSettings.setState({ profileKey: scope.profileKey });
  query = { kind: "playlist", id: "20" };
  root = createRoot(document.createElement("div"));
  summary.mockResolvedValue({
    kind: "playlist",
    id: "20",
    title: "Weekend",
    summary: "",
    smart: false,
    count: 500,
  });
  page.mockImplementation(async (offset) => response(offset));
  source.mockImplementation((_query, signal) => ({
    page: (offset, size) => abortable(page(offset, size), signal!),
    summary: () => summary(),
  }));
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  vi.unstubAllGlobals();
});

it("stores actual pages and jumps to item 10,000 without intermediate requests", async () => {
  page.mockImplementation(async (offset) => response(offset, 20_000));
  await render();
  await demand(10_000);
  expect(page.mock.calls.map(([offset]) => offset)).toEqual([0, 10_000]);
  expect(state.items.get(10_000)).toMatchObject({ position: 10_000 });
  const descriptor = client.getQueryData<{ revision: number }>(mediaListWindowKey(scope, query))!;
  expect(
    client.getQueryData(listPageOptions(scope, query, descriptor.revision, 10_000).queryKey),
  ).toMatchObject(response(10_000, 20_000));
  await demand(0);
  expect(page).toHaveBeenCalledTimes(2);
});

it("shares the first page across consumers and ignores playlist navigation library context", async () => {
  const pending = deferred<MediaListPage>();
  page.mockReturnValueOnce(pending.promise);
  await render();
  const second = createRoot(document.createElement("div"));
  function Other() {
    useMediaList({ ...query, libraryID: "99" });
    return null;
  }
  await act(async () => second.render(<Other />));
  const signal = source.mock.calls[0][1]!;
  expect(page).toHaveBeenCalledTimes(1);
  await act(async () => second.unmount());
  expect(signal.aborted).toBe(false);
  await act(async () => pending.resolve(response(0)));
  expect(state.total).toBe(500);
});

it("cancels the last consumer's request and discards responses from an old profile", async () => {
  const old = deferred<MediaListPage>();
  page.mockReturnValueOnce(old.promise);
  await render();
  const signal = source.mock.calls[0][1]!;
  await act(async () => useUserSettings.setState({ profileKey: "owner:2" }));
  expect(signal.aborted).toBe(true);
  await act(async () => old.resolve(response(0, 1)));
  expect(state.total).toBe(500);
  expect(state.items.size).toBe(100);
});

it("resets demand when changing lists and makes no requests without a profile", async () => {
  await render();
  await demand(300);
  query = { kind: "playlist", id: "21" };
  await render();
  expect(page.mock.calls.map(([offset]) => offset)).toEqual([0, 300, 0]);
  await act(async () => useUserSettings.setState({ profileKey: null }));
  expect(state.loading).toBe(false);
  expect(state.items.size).toBe(0);
});

it("retains page zero through a failed later page and retries that range", async () => {
  await render();
  page.mockRejectedValueOnce(new Error("offline"));
  await demand(100);
  expect(state.error).toBe("offline");
  expect(state.items.size).toBe(100);
  await act(async () => {
    await state.retry();
  });
  expect(state.error).toBeNull();
  expect(state.items.size).toBe(200);
});

it("discovers the end of a list whose first page has no total", async () => {
  page.mockImplementation(async (offset) => ({
    offset,
    total: offset === 0 ? null : 105,
    items: records(offset, offset === 0 ? 100 : 5),
  }));
  await render();
  expect(state.total).toBeNull();
  await demand(100);
  expect(state.total).toBe(105);
  expect(state.knownSize).toBe(105);
  expect(state.items.size).toBe(105);
  await demand(0);
  expect(state.total).toBe(105);
  await demand(200);
  expect(page.mock.calls.map(([offset]) => offset)).toEqual([0, 100]);
});

it("retries first-page failures and completes an empty result", async () => {
  source.mockImplementationOnce(() => {
    throw new Error("missing session");
  });
  await render();
  expect(state.loading).toBe(false);
  expect(state.error).toBe("missing session");
  page.mockResolvedValueOnce(response(0, 0));
  await act(async () => {
    await state.retry();
  });
  expect(state.total).toBe(0);
  expect(state.error).toBeNull();
});

it("bounds page work and stops after the known last page", async () => {
  await render();
  const completions: Array<() => void> = [];
  page.mockImplementation(
    (offset) => new Promise((resolve) => completions.push(() => resolve(response(offset)))),
  );
  await demand(100, 499);
  expect(page).toHaveBeenCalledTimes(3);
  await act(async () => completions.shift()!());
  expect(page).toHaveBeenCalledTimes(4);
  await act(async () => completions.splice(0).forEach((finish) => finish()));
  await act(async () => completions.splice(0).forEach((finish) => finish()));
  expect(state.items.size).toBe(500);
  await demand(500, 699);
  expect(page).toHaveBeenCalledTimes(5);
});

it("publishes pages and summary together after reordering the current window", async () => {
  await render();
  await demand(100);
  await demand(300);
  const first = deferred<MediaListPage>();
  const last = deferred<MediaListPage>();
  page.mockImplementation((offset) => (offset === 0 ? first.promise : last.promise));
  summary.mockResolvedValue({
    kind: "playlist",
    id: "20",
    title: "Updated",
    summary: "",
    smart: false,
    count: 400,
  });
  const before = [...state.items];
  let pending!: Promise<void>;
  await act(async () => {
    pending = refresh();
  });
  expect([...state.items]).toEqual(before);
  expect(state.summary?.title).toBe("Weekend");
  await act(async () => first.resolve(response(0, 400)));
  expect([...state.items]).toEqual(before);
  expect(state.summary?.title).toBe("Weekend");
  await act(async () => {
    last.resolve(response(300, 400));
    await pending;
  });
  expect(state.total).toBe(400);
  expect(state.summary?.title).toBe("Updated");
  expect(state.items.size).toBe(200);
  expect(state.items.has(100)).toBe(false);
});

it("retains a failed replacement and retries its complete visible window", async () => {
  await render();
  await demand(100);
  const before = [...state.items];
  page.mockImplementation(async (offset) => {
    if (offset === 100) throw new Error("offline");
    return response(offset);
  });
  await act(async () => {
    await refresh();
  });
  expect(state.error).toBe("offline");
  expect([...state.items]).toEqual(before);
  expect(state.loading).toBe(false);
  page.mockImplementation(async (offset) => response(offset, 200));
  await act(async () => {
    await state.retry();
  });
  expect(state.error).toBeNull();
  expect(state.total).toBe(200);
});

it("refreshes the requested list without touching another list or profile", async () => {
  await render();
  await act(async () => {
    await changed({ id: "21" });
    await changed({ profileKey: "other" });
  });
  expect(page).toHaveBeenCalledTimes(1);
  await act(async () => {
    await changed();
  });
  expect(page).toHaveBeenCalledTimes(2);
});

it("patches all repeated positions and inactive pages without changing playlist item IDs", async () => {
  await render();
  await demand(100);
  await demand(0);
  page.mockClear();
  const updated = { ...metadata, title: "New", summary: "Canonical" };
  await act(async () => {
    await applyMediaListChanges(client, [
      {
        change: { ...scope, kind: "item", effect: "unknown", id: "3", sectionId: "1" },
        update: { item: updated as LibraryCardDto, metadata: updated, sectionId: "1" },
      },
    ]);
  });
  expect(page).not.toHaveBeenCalled();
  expect(state.items.get(0)).toMatchObject({
    playlistItemID: "1000",
    position: 0,
    item: { title: "New", playlistItemID: "1000" },
  });
  await demand(100);
  expect(page).not.toHaveBeenCalled();
  expect(state.items.get(101)).toMatchObject({
    playlistItemID: "1101",
    position: 101,
    item: { title: "New" },
  });
});

it("refreshes a smart list even when its unknown predicate's fields are not in loaded metadata", async () => {
  summary.mockResolvedValue({
    kind: "playlist",
    id: "20",
    title: "Smart",
    summary: "",
    smart: true,
    count: 500,
  });
  await render();
  await act(async () => {
    await applyMediaListChanges(client, [
      {
        change: { ...scope, kind: "item", effect: "unknown", id: "3", sectionId: "1" },
        update: { item: metadata as LibraryCardDto, metadata, sectionId: "1" },
      },
    ]);
  });
  expect(page).toHaveBeenCalledTimes(2);
});

it("cancels an older range before a structural change can replace its positions", async () => {
  await render();
  const old = deferred<MediaListPage>();
  page.mockReturnValueOnce(old.promise);
  await demand(100);
  const signal = source.mock.lastCall![1]!;
  await act(async () => {
    await changed();
  });
  expect(signal.aborted).toBe(true);
  await act(async () => old.resolve(response(100, 101)));
  expect(state.total).toBe(500);
});

it("does not deduplicate repeated playlist titles but rejects repeated playlist-entry IDs", async () => {
  page.mockImplementationOnce(async () => ({
    offset: 0,
    total: 2,
    items: records(0, 2).map((record) => ({ ...record, playlistItemID: "same" })),
  }));
  await render();
  expect(state.error).toContain("changed while loading");
  expect(state.items.size).toBe(0);
});
