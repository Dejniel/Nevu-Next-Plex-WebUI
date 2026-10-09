import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { notifyManager } from "@tanstack/react-query";
import { setMediaPlayedStatus } from "entities/media/model";
import { useAuthSession } from "features/session/model";
import { serverQueryClient } from "shared/api/queryClient";
import { useEpisodeActions } from "./useEpisodeActions";
import type { TitleEpisodesModel } from "./useTitleEpisodes";

vi.mock("entities/media/api/media", async (original) => ({
  ...(await original<typeof import("entities/media/api/media")>()),
  setMediaPlayedStatus: vi.fn(),
}));
let scope = { serverId: "server", profileKey: "owner" };
vi.mock("features/session/model", async (original) => ({
  ...(await original<typeof import("features/session/model")>()),
  getActiveServerScope: () => scope,
}));
const episode = (id: string, title = id) =>
  ({ ratingKey: id, title, type: "episode" }) as Plex.Metadata;
const browser = (
  ids = ["a", "b"],
  identity = "season-one",
): TitleEpisodesModel => ({
  identity,
  scope,
  revision: 1,
  seasons: [],
  seasonId: "s1",
  selectSeason: vi.fn(),
  episodes: ids.map((id) => episode(id)),
  loading: false,
  error: null,
  retry: vi.fn(),
});
let root: Root;
let state: ReturnType<typeof useEpisodeActions>;
function Harness({ source }: { source: TitleEpisodesModel }) {
  state = useEpisodeActions(source);
  return null;
}
const render = async (source = browser()) => {
  await act(async () =>
    root.render(<Harness key={source.identity} source={source} />),
  );
};
beforeAll(() => notifyManager.setScheduler(queueMicrotask));
afterAll(() =>
  notifyManager.setScheduler((callback) => setTimeout(callback, 0)),
);
beforeEach(async () => {
  vi.resetAllMocks();
  serverQueryClient.clear();
  scope = { serverId: "server", profileKey: "owner" };
  useAuthSession.setState({ status: "ready", revision: 1 });
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  root = createRoot(document.createElement("div"));
  vi.mocked(setMediaPlayedStatus).mockResolvedValue();
  await render();
});
afterEach(async () => {
  await act(async () => root.unmount());
  serverQueryClient.clear();
});

it("uses refreshed episodes as the source and retains selection by ID", async () => {
  await act(async () => state.selection.start("a"));
  const refreshed = browser();
  refreshed.episodes = [episode("a", "New title"), episode("b")];
  await render(refreshed);
  expect(state.selectedCount).toBe(1);
  await act(async () => state.request(false, refreshed.episodes[0]));
  expect(state.confirmation?.message).toContain("New title");
  await act(async () => state.confirmation?.confirm());
  expect(setMediaPlayedStatus).toHaveBeenCalledWith(
    false,
    "a",
    expect.any(AbortSignal),
  );
  expect(state.confirmation).toBeNull();
  expect(state.selection.active).toBe(true);
});

it("does not open a batch action for an empty selection or send removed IDs", async () => {
  await act(async () => state.request(true));
  expect(state.confirmation).toBeNull();
  await act(async () => state.selection.toggleAll(["a", "b", "removed"]));
  await render(browser(["b"]));
  expect(state.selectedCount).toBe(1);
  await act(async () => state.request(true));
  await act(async () => state.confirmation?.confirm());
  expect(
    vi.mocked(setMediaPlayedStatus).mock.calls.map(([, id]) => id),
  ).toEqual(["b"]);
  expect(state.selection.active).toBe(false);
});

it("retains only failed episodes after a partial write and retries those IDs", async () => {
  vi.mocked(setMediaPlayedStatus).mockImplementation(async (_, id) => {
    if (id === "b") throw new Error("HTTP 500");
  });
  await act(async () => state.selection.toggleAll(["a", "b"]));
  await act(async () => state.request(true));
  await act(async () => state.confirmation?.confirm());
  expect(state.confirmation?.error).toContain("Could not update 1 episode");
  expect(state.confirmation?.message).toContain("1 episode");
  expect([...state.selection.ids]).toEqual(["b"]);
  vi.mocked(setMediaPlayedStatus).mockResolvedValue();
  await act(async () => state.confirmation?.confirm());
  expect(
    vi.mocked(setMediaPlayedStatus).mock.calls.map(([, id]) => id),
  ).toEqual(["a", "b", "b"]);
  expect(state.confirmation).toBeNull();
  expect(state.selection.active).toBe(false);
});

it("keeps single-episode failures in the confirmation without changing selection", async () => {
  vi.mocked(setMediaPlayedStatus).mockRejectedValue(new Error("HTTP 403"));
  await act(async () => state.request(true, episode("a")));
  await act(async () => state.confirmation?.confirm());
  expect(state.confirmation?.error).toContain("Could not update 1 episode");
  expect(state.selection.active).toBe(false);
  await act(async () => state.confirmation?.cancel());
  expect(state.confirmation).toBeNull();
});

it("resets selection and confirmation on season changes", async () => {
  await act(async () => state.selection.start("a"));
  await act(async () => state.request(true));
  await render(browser(["c", "d"], "season-two"));
  expect(state.selectedCount).toBe(0);
  expect(state.selection.active).toBe(false);
  expect(state.confirmation).toBeNull();
});

it("does not send a delayed confirmation under another profile or session", async () => {
  await act(async () => state.request(true, episode("a")));
  scope = { ...scope, profileKey: "guest" };
  await act(async () => state.confirmation?.confirm());
  expect(setMediaPlayedStatus).not.toHaveBeenCalled();
  expect(state.confirmation?.error).toContain("session changed");
  scope = { ...scope, profileKey: "owner" };
  await act(async () => useAuthSession.setState({ revision: 2 }));
  await act(async () => state.confirmation?.confirm());
  expect(setMediaPlayedStatus).not.toHaveBeenCalled();
});

it("bounds batch concurrency and cancels queued work when the season closes", async () => {
  const source = browser(Array.from({ length: 12 }, (_, i) => String(i)));
  await render(source);
  const finish: Array<() => void> = [];
  vi.mocked(setMediaPlayedStatus).mockImplementation(
    () => new Promise<void>((resolve) => finish.push(resolve)),
  );
  await act(async () =>
    state.selection.toggleAll(source.episodes.map((item) => item.ratingKey)),
  );
  await act(async () => state.request(true));
  await act(async () => state.confirmation?.confirm());
  expect(state.busy).toBe(true);
  expect(setMediaPlayedStatus).toHaveBeenCalledTimes(4);
  const signals = vi
    .mocked(setMediaPlayedStatus)
    .mock.calls.map(([, , signal]) => signal);
  await render(browser(["new"], "season-two"));
  expect(signals.every((signal) => signal?.aborted)).toBe(true);
  await act(async () => finish.forEach((resolve) => resolve()));
  expect(setMediaPlayedStatus).toHaveBeenCalledTimes(4);
  expect(state.selectedCount).toBe(0);
  expect(state.confirmation).toBeNull();
});

it("survives the development StrictMode effect remount", async () => {
  const source = browser();
  await act(async () =>
    root.render(
      <React.StrictMode>
        <Harness key={source.identity} source={source} />
      </React.StrictMode>,
    ),
  );
  await act(async () => state.request(true, episode("a")));
  await act(async () => state.confirmation?.confirm());
  expect(setMediaPlayedStatus).toHaveBeenCalledTimes(1);
});
