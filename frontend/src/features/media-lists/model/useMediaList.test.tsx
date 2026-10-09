import { notifyManager } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useServerSession } from "features/session/model";
import { useUserSettings } from "features/settings/model";
import { serverQueryClient as client } from "shared/api/queryClient";
import { createMediaListSource } from "../api/mediaLists";
import { listPageOptions, mediaListResultKey, mediaListWindowKey } from "./listPages";
import { applyMediaListChanges } from "./listSync";
import { useMediaList, useMediaListWindow } from "./useMediaList";
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
let range = { start: 0, end: 0, visibleStart: 0, visibleEnd: 0 };
function Harness() {
  state = useMediaList(useMediaListWindow(query), range);
  return null;
}
const render = async () => {
  await act(async () => root.render(<Harness />));
};
const demand = async (start: number, end = start + 99) => {
  range = { start, end, visibleStart: start, visibleEnd: end };
  await render();
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
  range = { start: 0, end: 0, visibleStart: 0, visibleEnd: 0 };
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

it("keeps audio/video indexes separate and reuses audio pages across library navigation contexts", async () => {
  page.mockImplementation(async () => ({ offset: 0, total: 1, items: [{
    kind: "playlist", id: query.playlistType === "audio" ? "30" : "20", title: "Playlist", summary: "", smart: false, count: 2,
  }] }));
  query = { kind: "playlist", libraryID: "1", playlistType: "video" };
  await render();
  expect(state.items.get(0)).toMatchObject({ id: "20" });
  query = { ...query, playlistType: "audio" };
  await render();
  expect(state.items.get(0)).toMatchObject({ id: "30" });
  query = { ...query, libraryID: "2" };
  await render();
  expect(state.items.get(0)).toMatchObject({ id: "30" });
  expect(page).toHaveBeenCalledTimes(2);
  query = { ...query, playlistType: "video" };
  await render();
  expect(state.items.get(0)).toMatchObject({ id: "20" });
  expect(page).toHaveBeenCalledTimes(2);
});

it("shares the first page across consumers and ignores playlist navigation library context", async () => {
  const pending = deferred<MediaListPage>();
  page.mockReturnValueOnce(pending.promise);
  await render();
  const second = createRoot(document.createElement("div"));
  function Other() {
    useMediaList(useMediaListWindow({ ...query, libraryID: "99" }));
    return null;
  }
  await act(async () => second.render(<Other />));
  const signal = source.mock.calls[0][1]!;
  expect(page).toHaveBeenCalledTimes(1);
  await act(async () => second.unmount());
  expect(signal.aborted).toBe(false);
  await act(async () => pending.resolve(response(0)));
  expect(state.totalSize).toBe(500);
});

it("cancels the last consumer's request and discards responses from an old profile", async () => {
  const old = deferred<MediaListPage>();
  page.mockReturnValueOnce(old.promise);
  await render();
  const signal = source.mock.calls[0][1]!;
  await act(async () => useUserSettings.setState({ profileKey: "owner:2" }));
  expect(signal.aborted).toBe(true);
  await act(async () => old.resolve(response(0, 1)));
  expect(state.totalSize).toBe(500);
  expect(state.items.size).toBe(100);
});

it("resets demand when changing lists and makes no requests without a profile", async () => {
  await render();
  await demand(300);
  query = { kind: "playlist", id: "21" };
  range = { start: 0, end: 0, visibleStart: 0, visibleEnd: 0 };
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
  expect(state.errors.get(100)?.message).toBe("offline");
  expect(state.errors.has(0)).toBe(false);
  expect(state.items.size).toBe(100);
  await act(async () => {
    await state.retry(100);
  });
  expect(state.errors.size).toBe(0);
  expect(state.items.size).toBe(200);
});

it("keeps errors scoped to their pages and retries only the requested failure", async () => {
  await render();
  const failed = new Set([100, 200]);
  page.mockImplementation(async (offset) => {
    if (failed.has(offset)) throw new Error(`Offline ${offset}`);
    return response(offset);
  });
  await demand(100, 299);
  expect([...state.errors.keys()]).toEqual([100, 200]);
  expect(state.hasData).toBe(true);
  failed.delete(100);
  await act(async () => {
    await state.retry(100);
  });
  expect([...state.errors.keys()]).toEqual([200]);
  expect(state.items.has(100)).toBe(true);
  expect(page.mock.calls.filter(([offset]) => offset === 0)).toHaveLength(1);
  expect(page.mock.calls.filter(([offset]) => offset === 200)).toHaveLength(1);
});

it("discovers the end of a list whose first page has no total", async () => {
  page.mockImplementation(async (offset) => ({
    offset,
    total: offset === 0 ? null : 105,
    items: records(offset, offset === 0 ? 100 : 5),
  }));
  await render();
  expect(state.totalSize).toBeNull();
  await demand(100);
  expect(state.totalSize).toBe(105);
  expect(state.knownSize).toBe(105);
  expect(state.items.size).toBe(105);
  await demand(0);
  expect(state.totalSize).toBe(105);
  await demand(200);
  expect(page.mock.calls.map(([offset]) => offset)).toEqual([0, 100]);
});

it("retries first-page failures and completes an empty result", async () => {
  source.mockImplementationOnce(() => {
    throw new Error("missing session");
  });
  await render();
  expect(state.loading).toBe(false);
  expect(state.errors.get(0)?.message).toBe("missing session");
  page.mockResolvedValueOnce(response(0, 0));
  await act(async () => {
    await state.retry(0);
  });
  expect(state.totalSize).toBe(0);
  expect(state.errors.size).toBe(0);
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
  expect(state.totalSize).toBe(400);
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
  expect(state.errors.get(0)?.message).toBe("offline");
  expect([...state.items]).toEqual(before);
  expect(state.loading).toBe(false);
  page.mockImplementation(async (offset) => response(offset, 200));
  await act(async () => {
    await state.retry(0);
  });
  expect(state.errors.size).toBe(0);
  expect(state.totalSize).toBe(200);
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

it("deletes a playlist's cached windows while refreshing listings without reading the deleted playlist", async () => {
  await render();
  await demand(300);
  const deletedQuery = query;
  await act(async () => root.unmount());
  root = createRoot(document.createElement("div"));
  query = { kind: "playlist" };
  range = { start: 0, end: 0, visibleStart: 0, visibleEnd: 0 };
  await render();
  const otherProfile = { ...scope, profileKey: "other" };
  const otherPlaylist = { ...deletedQuery, id: "21" };
  client.setQueryData(listPageOptions(otherProfile, deletedQuery, 0, 0).queryKey, { ...response(0), summary: null });
  client.setQueryData(listPageOptions(scope, otherPlaylist, 0, 0).queryKey, { ...response(0), summary: null });
  // The descriptor can be evicted before its inactive pages. Deletion must
  // clear these pages too, without needing to recreate their window.
  client.removeQueries({ queryKey: mediaListWindowKey(scope, deletedQuery), exact: true });
  page.mockClear();
  source.mockClear();
  await act(async () => { await changed({ effect: "removed" }); });
  expect(client.getQueryCache().findAll({ queryKey: mediaListResultKey(scope, deletedQuery) })).toHaveLength(0);
  expect(client.getQueryData(listPageOptions(otherProfile, deletedQuery, 0, 0).queryKey)).toBeDefined();
  expect(client.getQueryData(listPageOptions(scope, otherPlaylist, 0, 0).queryKey)).toBeDefined();
  expect(page).toHaveBeenCalledTimes(1);
  expect(source.mock.calls.every(([request]) => request.id === undefined)).toBe(true);
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
  expect(state.totalSize).toBe(500);
});

it("does not deduplicate repeated playlist titles but rejects repeated playlist-entry IDs", async () => {
  page.mockImplementationOnce(async () => ({
    offset: 0,
    total: 2,
    items: records(0, 2).map((record) => ({ ...record, playlistItemID: "same" })),
  }));
  await render();
  expect(state.errors.get(0)?.message).toContain("changed while loading");
  expect(state.items.size).toBe(0);
});
