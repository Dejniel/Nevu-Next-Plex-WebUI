import type { Mock } from "vitest";
import { serverQueryClient } from "shared/api/queryClient";
import { watchlistQueryKey, useWatchlistAction } from "../model/watchlistQuery";
import { useAuthSession } from "features/session/model";
import { notifyManager } from "@tanstack/react-query";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  indexMediaAvailability,
  useMediaAvailability,
} from "entities/media/model";
import { getWatchlist } from "../api/watchlist";
import WatchlistView from "./WatchlistView";

beforeAll(() => notifyManager.setScheduler(queueMicrotask));
afterAll(() => notifyManager.setScheduler(callback => setTimeout(callback, 0)));

vi.mock("react-router-dom", async () => {
  const { useState } = await import("react");
  return { useSearchParams: () => useState(new URLSearchParams()) };
});

vi.mock("../api/watchlist", () => ({
  getWatchlist: vi.fn(),
  removeFromWatchlist: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("entities/media/model", async () => ({
  ...(await vi.importActual<typeof import("entities/media/model")>(
    "entities/media/model",
  )),
  useMediaAvailability: vi.fn(),
}));
vi.mock("entities/library/model", () => ({
  useLibraries: () => ({ data: [
    { key: "1", title: "Movies" },
    { key: "2", title: "Other movies" },
  ] }),
}));
vi.mock("features/settings/model", () => ({
  useUserSettings: Object.assign((select: (state: unknown) => unknown) =>
    select({ profileKey: "user:1" }), { getState: () => ({ profileKey: "user:1" }) }),
}));
vi.mock("features/library/public", () => ({
  getLibraryCardWidth: () => 200,
  useLibraryCardView: () => ({ layout: "poster", size: 40 }),
  LibraryBrowseFrame: ({
    leading,
    filters,
    children,
  }: {
    leading: React.ReactNode;
    filters: React.ReactNode;
    children: React.ReactNode;
  }) => (
    <div>
      {leading}
      {filters}
      {children}
    </div>
  ),
}));
vi.mock("features/media-actions/public", () => ({
  ActionableMediaCard: ({
    item,
    canPlay,
  }: {
    item: Plex.Metadata;
    canPlay: boolean;
  }) => {
    const action = useWatchlistAction(item);
    return (
    <div data-rating-key={item.ratingKey}>
      {item.title}
      <button disabled={!canPlay}>Play {item.title}</button>
      <button onClick={() => void action.toggle()}>
        Remove {item.title}
      </button>
    </div>
  ); },
}));
vi.mock("shared/ui/VirtualGrid", () => ({
  useVirtualGrid: (options: { count: number }) => options,
  default: ({
    grid: { count },
    renderItem,
  }: {
    grid: { count: number };
    renderItem: (index: number, sizes: string) => React.ReactNode;
  }) => (
    <div>
      {Array.from({ length: count }, (_, index) => (
        <div key={index}>{renderItem(index, "200px")}</div>
      ))}
    </div>
  ),
}));

const items = [
  { guid: "plex://movie/one", type: "movie", ratingKey: "one", title: "Alpha", year: 2024 },
  { guid: "plex://movie/two", type: "movie", ratingKey: "two", title: "Beta", year: 2020 },
  { guid: "plex://movie/three", type: "movie", ratingKey: "three", title: "Remote" },
] as Plex.Metadata[];
const copies = [
  { ...items[0], ratingKey: "10", librarySectionID: 1 },
  { ...items[0], ratingKey: "20", librarySectionID: 2 },
  { ...items[1], ratingKey: "30", librarySectionID: 2 },
];
let root: Root;
let element: HTMLDivElement;
async function render(libraryID?: string) {
  await act(async () => root.render(<WatchlistView libraryID={libraryID} />));
}
beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  serverQueryClient.clear();
  useAuthSession.setState({ status: "ready", revision: 1 });
  (getWatchlist as Mock).mockResolvedValue(items);
  serverQueryClient.setQueryData(watchlistQueryKey("user:1"), items);
  (useMediaAvailability as Mock).mockReturnValue({
    items: indexMediaAvailability(copies),
    loading: false,
    error: null,
    retry: vi.fn(),
  });
  element = document.createElement("div");
  document.body.appendChild(element);
  root = createRoot(element);
});
afterEach(async () => {
  await act(async () => root.unmount());
  element.remove();
});

it("defaults to the library's copies and toggles to the full Watchlist", async () => {
  await render("1");
  expect(element.querySelector('[data-rating-key="10"]')).not.toBeNull();
  expect(element.textContent).not.toContain("Beta");
  expect(element.textContent).not.toContain("Remote");
  await act(async () =>
    (
      element.querySelector('input[type="checkbox"]') as HTMLInputElement
    ).click(),
  );
  expect(element.textContent).toContain("3 titles");
  expect(element.textContent).toContain("Unavailable on this server");
  const play = Array.from(element.querySelectorAll("button")).find(
    (button) => button.textContent === "Play Remote",
  );
  expect(play?.disabled).toBe(true);
});

it("shows the full list from Home and reacts to removing a title without reopening", async () => {
  await render();
  expect(element.querySelector('input[type="checkbox"]')).toBeNull();
  expect(element.textContent).toContain("3 titles");
  const remove = Array.from(element.querySelectorAll("button")).find(
    (button) => button.textContent === "Remove Beta",
  )!;
  await act(async () => remove.click());
  expect(element.textContent).toContain("2 titles");
  expect(element.textContent).not.toContain("Beta");
});

it("reports a failed availability lookup without presenting a false empty library", async () => {
  (useMediaAvailability as Mock).mockReturnValue({
    items: new Map(),
    loading: false,
    error: "Availability request failed",
    retry: vi.fn(),
  });
  await render("1");
  expect(element.textContent).toContain("Availability unknown");
  expect(element.textContent).toContain("Availability request failed");
  expect(element.textContent).not.toContain("Your Watchlist is empty");
  expect(element.textContent).not.toContain(
    "No Watchlist titles in this library",
  );
});
