import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useUserSettings } from "features/settings/model";
import { createMediaListSource } from "../api/mediaLists";
import {
  MEDIA_LISTS_CHANGED_EVENT,
  type MediaListPage,
  type MediaListQuery,
} from "./mediaLists";
import { useMediaList } from "./useMediaList";

jest.mock("../api/mediaLists", () => ({ createMediaListSource: jest.fn() }));
const source = createMediaListSource as jest.Mock;
const page = jest.fn();
const summary = jest.fn();
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
  jest.resetAllMocks();
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
  source.mockImplementationOnce(() => {
    throw new Error("missing session");
  });
  await render();
  expect(state.loading).toBe(false);
  expect(state.error).toBe("missing session");
  page.mockResolvedValueOnce({ offset: 0, total: 0, items: [] });
  await act(async () => state.retry());
  expect(state.error).toBeNull();
  expect(state.loading).toBe(false);
  expect(state.total).toBe(0);
});

it("does not issue list requests without a profile and aborts old windows", async () => {
  await render();
  const signal = source.mock.calls[0][1] as AbortSignal;
  await act(async () => useUserSettings.setState({ profileKey: null }));
  expect(signal.aborted).toBe(true);
  expect(state.loading).toBe(false);
  expect(state.items.size).toBe(0);
  expect(source).toHaveBeenCalledTimes(1);
});

it("refreshes a changed list for its profile without refreshing unrelated lists", async () => {
  await render();
  const changed = (extra = {}) =>
    window.dispatchEvent(
      new CustomEvent(MEDIA_LISTS_CHANGED_EVENT, {
        detail: {
          kind: "playlist",
          id: "20",
          libraryID: "2",
          profileKey: "owner:1",
          ...extra,
        },
      }),
    );
  await act(async () => {
    changed({ id: "21" });
    changed({ profileKey: "owner:2" });
    changed({ kind: "collection" });
  });
  expect(source).toHaveBeenCalledTimes(1);
  await act(async () => changed());
  expect(source).toHaveBeenCalledTimes(2);
  expect(page).toHaveBeenCalledTimes(2);
});
