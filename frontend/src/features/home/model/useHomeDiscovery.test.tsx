import type { Mock, MockInstance } from "vitest";
import React, { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { notifyManager } from "@tanstack/react-query";
import { getMediaMetadata, mediaMetadataQueryOptions } from "entities/media/model";
import { serverQueryClient } from "shared/api/queryClient";
import { getLibraries } from "entities/library/model";
import { getLibraryDirectory } from "features/library/model";
import { useHomeDiscovery } from "./useHomeDiscovery";
vi.mock("entities/library/api/libraries", () => ({ getLibraries: vi.fn() }));
vi.mock("features/library/api/libraryDirectories", async (original) => ({
  ...(await original<typeof import("features/library/api/libraryDirectories")>()),
  getLibraryDirectory: vi.fn(),
}));
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
afterAll(() => notifyManager.setScheduler((callback) => setTimeout(callback, 0)));

const movies = { key: "1", uuid: "movies", title: "Movies", type: "movie" };
const shows = { key: "2", uuid: "shows", title: "TV", type: "show" };
let state: ReturnType<typeof useHomeDiscovery>;
let root: Root;
let element: HTMLDivElement;
let settings: Record<string, string>;
let consoleError: MockInstance;

function Harness() {
  state = useHomeDiscovery(settings);
  return null;
}

beforeEach(() => {
  vi.resetAllMocks();
  serverQueryClient.clear();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
  settings = {};
  element = document.createElement("div");
  document.body.appendChild(element);
  root = createRoot(element);
  (getLibraries as Mock).mockResolvedValue([]);
  (getLibraryDirectory as Mock).mockResolvedValue({ Directory: [] });
});

afterEach(async () => {
  await act(async () => root.unmount());
  element.remove();
  serverQueryClient.clear();
  consoleError.mockRestore();
});

async function renderHome() {
  await act(async () => root.render(<Harness />));
}

it("finishes loading an account with no movie or TV libraries", async () => {
  (getLibraries as Mock).mockResolvedValue([
    { key: "3", uuid: "music", title: "Music", type: "artist" },
  ]);

  await renderHome();

  expect(state.catalogStatus).toBe("empty");
  expect(state.heroLoading).toBe(false);
  expect(state.shelves).toEqual([]);
  expect(getLibraryDirectory).not.toHaveBeenCalled();
});

it("recognizes existing empty libraries when Plex omits Metadata", async () => {
  (getLibraries as Mock).mockResolvedValue([movies, shows]);

  await renderHome();

  expect(state.catalogStatus).toBe("empty");
  expect(state.heroLoading).toBe(false);
  expect(vi.mocked(getLibraryDirectory).mock.calls.some(([dir]) => dir.endsWith("/genre"))).toBe(
    false,
  );
});

it("keeps a populated library ready even when none of its media has hero artwork", async () => {
  (getLibraries as Mock).mockResolvedValue([movies]);
  (getLibraryDirectory as Mock).mockResolvedValue({
    size: 1,
    totalSize: 1,
    Metadata: [{ ratingKey: "10", title: "A movie", type: "movie" }],
  });

  await renderHome();

  expect(state.catalogStatus).toBe("ready");
  expect(state.hero).toBeNull();
  expect(state.heroLoading).toBe(false);
});

it("checks unpinned libraries before deciding that the catalog is empty", async () => {
  settings = { LIBRARY_movies: "false" };
  (getLibraries as Mock).mockResolvedValue([movies]);
  (getLibraryDirectory as Mock).mockResolvedValue({ size: 1, totalSize: 5 });

  await renderHome();

  expect(state.catalogStatus).toBe("ready");
  expect(getLibraryDirectory).toHaveBeenCalledWith(
    "/library/sections/1/all",
    { sort: "titleSort:asc", "X-Plex-Container-Start": 0, "X-Plex-Container-Size": 1 },
    expect.any(AbortSignal),
  );
});

it("shows a loading error instead of an empty catalog when a library request fails", async () => {
  (getLibraries as Mock).mockResolvedValue([movies]);
  (getLibraryDirectory as Mock).mockRejectedValue(new Error("Unavailable"));

  await renderHome();

  expect(state.catalogStatus).toBe("error");
  expect(state.heroLoading).toBe(false);
});

it("can refresh after media is added to an empty library", async () => {
  (getLibraries as Mock).mockResolvedValue([movies]);
  await renderHome();
  expect(state.catalogStatus).toBe("empty");

  (getLibraryDirectory as Mock).mockResolvedValue({ size: 1, totalSize: 1 });
  await act(async () => {
    await state.refresh();
  });

  expect(state.catalogStatus).toBe("ready");
});

it("ignores an old catalog result after refresh", async () => {
  let finishOldRequest!: (value: { size: number }) => void;
  (getLibraries as Mock).mockResolvedValue([movies]);
  (getLibraryDirectory as Mock).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishOldRequest = resolve;
      }),
  );
  await renderHome();
  expect(state.catalogStatus).toBe("loading");

  (getLibraryDirectory as Mock).mockResolvedValue({ size: 1, totalSize: 1 });
  await act(async () => {
    await state.refresh();
  });
  expect(state.catalogStatus).toBe("ready");

  await act(async () => finishOldRequest({ size: 0 }));
  expect(state.catalogStatus).toBe("ready");
});

it("shares the hero metadata with title details and preserves it on a cached return", async () => {
  const hero = {
    ratingKey: "10",
    title: "Movie",
    type: "movie",
    art: "/art",
  } as Plex.Metadata;
  vi.mocked(getLibraries).mockResolvedValue([movies as Plex.LibarySection]);
  vi.mocked(getLibraryDirectory).mockResolvedValue({
    size: 1,
    totalSize: 1,
    Metadata: [hero],
  } as Plex.MediaContainer);
  vi.mocked(getMediaMetadata).mockResolvedValue(hero);
  await renderHome();
  expect(state.hero).toEqual(hero);
  expect(getMediaMetadata).toHaveBeenCalledTimes(1);
  await serverQueryClient.fetchQuery(mediaMetadataQueryOptions(scope, "10"));
  expect(getMediaMetadata).toHaveBeenCalledTimes(1);
  await act(async () => root.render(null));
  await renderHome();
  expect(state.hero).toEqual(hero);
  expect(getMediaMetadata).toHaveBeenCalledTimes(1);
});
