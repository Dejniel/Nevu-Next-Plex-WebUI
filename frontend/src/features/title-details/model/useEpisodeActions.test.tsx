import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { notifyManager } from "@tanstack/react-query";
import {
  AuthStorage,
  useAuthSession,
  useServerSession,
} from "features/session/model";
import {
  MediaActionDialogHost,
  openMediaWatchedDialog,
} from "features/media-actions/public";
import { ProxiedRequest } from "shared/api/backend";
import { serverQueryClient } from "shared/api/queryClient";
import { useEpisodeActions } from "./useEpisodeActions";
import type { TitleEpisodesModel } from "./useTitleEpisodes";

vi.mock("shared/api/backend", () => ({
  ProxiedRequest: vi.fn(),
  getBackendURL: () => "",
}));
const transport = vi.mocked(ProxiedRequest);
const scope = { serverId: "server", profileKey: "1:1" };
const episode = (id: string, title = id) =>
  ({ ratingKey: id, title, type: "episode" }) as Plex.Metadata;
const browser = (
  ids = ["11", "12"],
  identity = "season-one",
): TitleEpisodesModel => ({
  identity,
  scope,
  revision: 1,
  seasons: [],
  seasonId: "10",
  selectSeason: vi.fn(),
  episodes: ids.map((id) => episode(id)),
  loading: false,
  error: null,
  retry: vi.fn(),
});
let root: Root;
let host: HTMLDivElement;
let state: ReturnType<typeof useEpisodeActions>;
function Harness({ source }: { source: TitleEpisodesModel }) {
  state = useEpisodeActions(source);
  return null;
}
const render = async (source = browser()) =>
  act(async () =>
    root.render(
      <StrictMode>
        <Harness source={source} />
        <MediaActionDialogHost />
      </StrictMode>,
    ),
  );
const confirm = async (label = "Confirm") =>
  act(async () => {
    [...document.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent === label)!
      .click();
  });
const dialog = () => document.querySelector('[role="dialog"]');
const writtenIds = () =>
  transport.mock.calls.map(([path]) =>
    new URL(path, "https://plex.test").searchParams.get("key"),
  );
beforeAll(() => notifyManager.setScheduler(queueMicrotask));
afterAll(() =>
  notifyManager.setScheduler((callback) => setTimeout(callback, 0)),
);
beforeEach(async () => {
  vi.resetAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  serverQueryClient.clear();
  AuthStorage.saveActiveSession({
    profile: null,
    accountToken: "account",
    serverToken: "token",
  });
  useAuthSession.setState({
    status: "ready",
    revision: 1,
    ownerUser: { id: 1 } as Plex.UserData,
    activeUser: { id: 1, restricted: false } as Plex.UserData,
    activeProfile: {
      id: 1,
      isOwner: true,
      title: "Owner",
      restricted: false,
      protected: false,
    },
  });
  useServerSession.setState({
    server: { machineIdentifier: "server" } as Plex.ServerPreferences,
    canManageServer: true,
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  transport.mockResolvedValue({ status: 200, data: {} });
  await render();
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  serverQueryClient.clear();
  vi.unstubAllGlobals();
});

it("uses refreshed episode data and delegates a single action without clearing existing selection", async () => {
  await act(async () => state.selection.start("11"));
  const refreshed = browser();
  refreshed.episodes = [episode("11", "New title"), episode("12")];
  await render(refreshed);
  expect(state.selectedCount).toBe(1);
  await act(async () => state.request(false, refreshed.episodes[0]));
  expect(dialog()?.textContent).toContain("New title");
  await confirm();
  expect(writtenIds()).toEqual(["11"]);
  expect(state.selection.active).toBe(true);
});

it("does not open an empty batch or submit items removed from the current season", async () => {
  await act(async () => state.request(true));
  expect(dialog()).toBeNull();
  await act(async () => state.selection.toggleAll(["11", "12", "999"]));
  await render(browser(["12"]));
  await act(async () => state.request(true));
  await confirm();
  expect(writtenIds()).toEqual(["12"]);
  expect(state.selection.active).toBe(false);
});

it("retains failed selections and clears them only after the shared controller finishes the retry", async () => {
  transport.mockImplementation(async (path) => ({
    status: path.includes("key=12&") ? 503 : 200,
    data: {},
  }));
  await act(async () => state.selection.toggleAll(["11", "12"]));
  await act(async () => state.request(true));
  await confirm();
  expect([...state.selection.ids]).toEqual(["12"]);
  expect(dialog()?.textContent).toContain("1 episode as watched");
  transport.mockResolvedValue({ status: 200, data: {} });
  await confirm("Retry");
  expect(writtenIds()).toEqual(["11", "12", "12"]);
  expect(state.selection.active).toBe(false);
});

it("closes its dialog and cancels queued writes on a season change without remounting the selection owner", async () => {
  const source = browser(Array.from({ length: 12 }, (_, i) => String(i + 100)));
  await render(source);
  const finish: Array<() => void> = [];
  transport.mockImplementation(
    () =>
      new Promise((resolve) =>
        finish.push(() => resolve({ status: 200, data: {} })),
      ),
  );
  await act(async () =>
    state.selection.toggleAll(source.episodes.map((item) => item.ratingKey)),
  );
  await act(async () => state.request(true));
  await confirm();
  expect(transport).toHaveBeenCalledTimes(4);
  const signals = transport.mock.calls.map(([, , , , signal]) => signal);
  await render(browser(["20"], "season-two"));
  expect(signals.every((signal) => signal?.aborted)).toBe(true);
  await act(async () => finish.forEach((resolve) => resolve()));
  expect(transport).toHaveBeenCalledTimes(4);
  expect(state.selectedCount).toBe(0);
  expect(state.selection.active).toBe(false);
  expect(dialog()).toBeNull();
});

it("does not close a replacement card action when the episode owner leaves", async () => {
  await act(async () => state.request(true, episode("11")));
  await act(async () =>
    openMediaWatchedDialog(
      [{ ratingKey: "25", type: "movie", title: "Movie" }],
      false,
    ),
  );
  await act(async () => root.render(<MediaActionDialogHost />));
  expect(dialog()?.textContent).toContain('"Movie" as unwatched');
  await confirm();
  expect(writtenIds()).toEqual(["25"]);
});

it("does not attach episodes from an old server or profile to the new session", async () => {
  useServerSession.setState({
    server: { machineIdentifier: "another-server" } as Plex.ServerPreferences,
  });
  await act(async () => state.request(true, episode("11")));
  expect(dialog()).toBeNull();
  expect(transport).not.toHaveBeenCalled();
  useServerSession.setState({
    server: { machineIdentifier: "server" } as Plex.ServerPreferences,
  });
  await act(async () => useAuthSession.setState({ revision: 2 }));
  await act(async () => state.request(true, episode("11")));
  expect(dialog()).toBeNull();
  expect(transport).not.toHaveBeenCalled();
});

it("keeps ownership of an existing confirmation when an empty request is ignored", async () => {
  await act(async () => state.request(true, episode("11")));
  await act(async () => state.request(true));
  expect(dialog()?.textContent).toContain('"11" as watched');
  await render(browser(["20"], "season-two"));
  expect(dialog()).toBeNull();
  expect(transport).not.toHaveBeenCalled();
});
