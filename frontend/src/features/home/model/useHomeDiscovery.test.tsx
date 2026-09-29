import React, { act } from "react";
import { createRoot, Root } from "react-dom/client";
import {
  getHomeGenres,
  getHomeLibraries,
  getHomeLibraryWindow,
  getHomeMetadata,
} from "../api/home";
import { useHomeDiscovery } from "./useHomeDiscovery";

jest.mock("../api/home", () => ({
  getHomeLibraries: jest.fn(),
  getHomeGenres: jest.fn(),
  getHomeLibraryWindow: jest.fn(),
  getHomeMetadata: jest.fn(),
}));
jest.mock("entities/library/model", () => ({
  LIBRARIES_CHANGED_EVENT: "nevu:libraries-changed",
}));

const movies = { key: "1", uuid: "movies", title: "Movies", type: "movie" };
const shows = { key: "2", uuid: "shows", title: "TV", type: "show" };
let state: ReturnType<typeof useHomeDiscovery>;
let root: Root;
let element: HTMLDivElement;
let settings: Record<string, string>;
let consoleError: jest.SpyInstance;

function Harness() {
  state = useHomeDiscovery(settings);
  return null;
}

beforeEach(() => {
  jest.resetAllMocks();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
  settings = {};
  element = document.createElement("div");
  document.body.appendChild(element);
  root = createRoot(element);
  (getHomeLibraries as jest.Mock).mockResolvedValue([]);
  (getHomeLibraryWindow as jest.Mock).mockResolvedValue({ size: 0 });
  (getHomeGenres as jest.Mock).mockResolvedValue([]);
  (getHomeMetadata as jest.Mock).mockResolvedValue(null);
});

afterEach(async () => {
  await act(async () => root.unmount());
  element.remove();
  consoleError.mockRestore();
});

async function renderHome() {
  await act(async () => root.render(<Harness />));
}

it("finishes loading an account with no movie or TV libraries", async () => {
  (getHomeLibraries as jest.Mock).mockResolvedValue([
    { key: "3", uuid: "music", title: "Music", type: "artist" },
  ]);

  await renderHome();

  expect(state.catalogStatus).toBe("empty");
  expect(state.heroLoading).toBe(false);
  expect(state.shelves).toEqual([]);
  expect(getHomeLibraryWindow).not.toHaveBeenCalled();
});

it("recognizes existing empty libraries when Plex omits Metadata", async () => {
  (getHomeLibraries as jest.Mock).mockResolvedValue([movies, shows]);

  await renderHome();

  expect(state.catalogStatus).toBe("empty");
  expect(state.heroLoading).toBe(false);
  expect(getHomeGenres).not.toHaveBeenCalled();
});

it("keeps a populated library ready even when none of its media has hero artwork", async () => {
  (getHomeLibraries as jest.Mock).mockResolvedValue([movies]);
  (getHomeLibraryWindow as jest.Mock).mockResolvedValue({
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
  (getHomeLibraries as jest.Mock).mockResolvedValue([movies]);
  (getHomeLibraryWindow as jest.Mock).mockResolvedValue({ size: 1, totalSize: 5 });

  await renderHome();

  expect(state.catalogStatus).toBe("ready");
  expect(getHomeLibraryWindow).toHaveBeenCalledWith("1", 0, 1);
});

it("shows a loading error instead of an empty catalog when a library request fails", async () => {
  (getHomeLibraries as jest.Mock).mockResolvedValue([movies]);
  (getHomeLibraryWindow as jest.Mock).mockRejectedValue(new Error("Unavailable"));

  await renderHome();

  expect(state.catalogStatus).toBe("error");
  expect(state.heroLoading).toBe(false);
});

it("can refresh after media is added to an empty library", async () => {
  (getHomeLibraries as jest.Mock).mockResolvedValue([movies]);
  await renderHome();
  expect(state.catalogStatus).toBe("empty");

  (getHomeLibraryWindow as jest.Mock).mockResolvedValue({ size: 1, totalSize: 1 });
  await act(async () => state.refresh());

  expect(state.catalogStatus).toBe("ready");
});

it("ignores an old catalog result after refresh", async () => {
  let finishOldRequest!: (value: { size: number }) => void;
  (getHomeLibraries as jest.Mock).mockResolvedValue([movies]);
  (getHomeLibraryWindow as jest.Mock).mockImplementationOnce(() =>
    new Promise((resolve) => { finishOldRequest = resolve; }),
  );
  await renderHome();
  expect(state.catalogStatus).toBe("loading");

  (getHomeLibraryWindow as jest.Mock).mockResolvedValue({ size: 1, totalSize: 1 });
  await act(async () => state.refresh());
  expect(state.catalogStatus).toBe("ready");

  await act(async () => finishOldRequest({ size: 0 }));
  expect(state.catalogStatus).toBe("ready");
});
