import React, { act, Profiler } from "react";
import { createRoot, type Root } from "react-dom/client";
import { getLibraryPage } from "../api/libraryPage";
import { serverQueryClient as client } from "shared/api/queryClient";
import { useServerSession } from "features/session/model";
import type { LibraryQuery } from "../model/libraryQuery";
import { ContainedLibraryCollectionGrid, WindowLibraryCollectionGrid } from "./LibraryCollectionGrid";

vi.mock("../api/libraryPage", async (original) => ({
  ...await original<typeof import("../api/libraryPage")>(), getLibraryPage: vi.fn(),
}));
vi.mock("features/media-actions/public", () => ({
  ActionableMediaCard: ({ item }: { item: Plex.Metadata }) => (
    <div data-media-card>{item.title}</div>
  ),
}));
vi.mock("features/music/public", () => ({
  MusicMediaCard: ({ item }: { item: Plex.Metadata }) => <div data-media-card>{item.title}</div>,
}));
const viewport = vi.hoisted(() => ({ row: 0 }));
vi.mock("@tanstack/react-virtual", () => {
  const create = (options: { enabled: boolean; estimateSize: () => number; count: number }) => ({
    scrollOffset: viewport.row * options.estimateSize(),
    measure: () => {},
    measureElement: () => {},
    getTotalSize: () => options.count * options.estimateSize(),
    getVirtualItems: () => options.enabled && viewport.row < options.count
      ? [{ key: viewport.row, index: viewport.row, start: viewport.row * options.estimateSize() }]
      : [],
  });
  return { useWindowVirtualizer: create, useVirtualizer: create };
});
let root: Root;
let element: HTMLDivElement;
const request = vi.mocked(getLibraryPage);
const query: LibraryQuery = { profileKey: "owner", sectionId: 1, sort: "titleSort" };
const commits: string[] = [];
const scrollElementRef = { current: document.createElement("div") };

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    disconnect() {}
  });
  vi.spyOn(window, "scrollTo").mockImplementation(() => { viewport.row = 0; });
  viewport.row = 0;
  client.clear();
  client.mount();
  useServerSession.setState({ server: { machineIdentifier: "test-server" } as Plex.ServerPreferences });
  request.mockImplementation(async ({ offset, sectionId }) => ({
    offset, size: 64, totalSize: 20_000, hasMore: true,
    items: Array.from({ length: 64 }, (_, index) => ({
      ratingKey: `${sectionId}:${offset + index}`,
      guid: `plex://movie/${sectionId}:${offset + index}`,
      title: `Library ${sectionId} film ${offset + index}`,
      type: "movie", librarySectionID: sectionId,
    })),
  }));
  element = document.createElement("div");
  root = createRoot(element);
  commits.length = 0;
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  client.unmount();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function render(value = query, contained = false) {
  await act(async () => root.render(
    <Profiler id="grid" onRender={() => commits.push(element.textContent ?? "")}>
      {contained
        ? <ContainedLibraryCollectionGrid query={value} layout="poster" cardSize={40} scrollElementRef={scrollElementRef} />
        : <WindowLibraryCollectionGrid query={value} layout="poster" cardSize={40} />}
    </Profiler>,
  ));
}
async function settle() {
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
}

it("loads the grid and replaces its query without retaining the previous section", async () => {
  await render();
  await settle();
  expect(request).toHaveBeenCalledTimes(1);
  expect(element.textContent).toContain("Library 1 film 0");
  await render({ ...query, sectionId: 2 });
  await settle();
  expect(request).toHaveBeenCalledTimes(2);
  expect(element.textContent).toContain("Library 2 film 0");
});

it.each(["artist", "album", "track", "photoalbum", "photo"] as const)(
  "uses cached range jumps for %s through the shared catalog", async type => {
    request.mockImplementation(async ({ offset, sectionId }) => ({
      offset, size: 64, totalSize: 20_000, hasMore: true,
      items: Array.from({ length: 64 }, (_, index) => ({
        ratingKey: `${sectionId}:${offset + index}`, title: `${type} ${offset + index}`, type,
        librarySectionID: sectionId,
      })),
    }));
    const catalog = { ...query, type };
    await render(catalog);
    await settle();
    viewport.row = 10_000;
    await render(catalog);
    await settle();
    expect(element.textContent).toContain(`${type} 10000`);
    viewport.row = 0;
    await render(catalog);
    commits.length = 0;
    viewport.row = 10_000;
    await render(catalog);
    expect(commits[0]).toContain(`${type} 10000`);
    expect(request.mock.calls.map(([page]) => page.offset)).toEqual([0, 9984]);
    expect(request.mock.calls.every(([page]) => page.type === type)).toBe(true);
  },
);

it.each([false, true])("draws a cached jump in the first commit (contained: %s)", async (contained) => {
  await render(query, contained);
  await settle();
  viewport.row = 10_000;
  await render(query, contained);
  await settle();
  viewport.row = 0;
  await render(query, contained);
  commits.length = 0;
  viewport.row = 10_000;
  await render(query, contained);
  expect(commits.length).toBeGreaterThan(0);
  expect(commits.every(text => text.includes("Library 1 film 10000"))).toBe(true);
  expect(request.mock.calls.map(([page]) => page.offset)).toEqual([0, 9984]);
});

it("loads only the missing target page and keeps loaded cards while moving within it", async () => {
  await render();
  await settle();
  viewport.row = 10_000;
  await render();
  await settle();
  expect(element.textContent).toContain("Library 1 film 10000");
  commits.length = 0;
  viewport.row++;
  await render();
  expect(commits.every(text => text.includes("Library 1 film 10001"))).toBe(true);
  expect(request.mock.calls.map(([page]) => page.offset)).toEqual([0, 9984]);
});

it("retains the current range after a consistency error so a retry replaces that range", async () => {
  const response = request.getMockImplementation()!;
  request.mockImplementation(async (page, signal) => ({
    ...await response(page, signal), generationId: page.offset ? "other" : "first",
  }));
  await render();
  await settle();
  viewport.row = 10_000;
  await render();
  await settle();
  expect(element.textContent).toContain("The library changed while loading");
  expect(element.querySelector("[data-index]")?.getAttribute("data-index")).toBe("10000");
  request.mockImplementation(response);
  await act(async () => element.querySelector<HTMLButtonElement>("button")!.click());
  await settle();
  expect(element.textContent).toContain("Library 1 film 10000");
  expect(element.textContent).not.toContain("The library changed while loading");
  expect(request.mock.calls.map(([page]) => page.offset)).toEqual([0, 9984, 0, 9984]);
});
