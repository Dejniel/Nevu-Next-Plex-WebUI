import type { Mock } from "vitest";
import {
  AuthStorage,
  useAuthSession,
  useServerSession,
} from "features/session/model";
import { subscribeToMediaChanges } from "entities/media/model";
import { ProxiedRequest } from "shared/api/backend";
import { setMediaRating } from "./rating";

vi.mock("features/session/model", async () => ({
  ...(await vi.importActual<typeof import("features/session/model")>(
    "features/session/model",
  )),
  getXPlexProps: () => ({}),
}));
vi.mock("shared/api/backend", () => ({ ProxiedRequest: vi.fn() }));

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.clearAllMocks();
  AuthStorage.saveActiveSession({
    profile: null,
    accountToken: "account",
    serverToken: "server",
  });
  useAuthSession.setState({
    status: "ready",
    revision: 1,
    ownerUser: { id: 1 } as Plex.UserData,
    activeProfile: {
      id: 1,
      title: "Owner",
      protected: false,
      restricted: false,
      isOwner: true,
    },
  });
  useServerSession.setState({
    server: { machineIdentifier: "server" } as Plex.ServerPreferences,
  });
});

it.each([8, -1])(
  "saves or clears ratings through the active profile, supporting cancellation (%s)",
  async (rating) => {
    (ProxiedRequest as Mock).mockResolvedValue({ status: 200 });
    const signal = new AbortController().signal;
    await expect(setMediaRating(rating, "12", signal)).resolves.toBe(true);
    const url = new URL(
      vi.mocked(ProxiedRequest).mock.calls[0][0],
      "http://plex",
    );
    expect(url.pathname).toBe("/:/rate");
    expect(url.searchParams.get("rating")).toBe(String(rating));
    expect(url.searchParams.get("key")).toBe("12");
    expect(url.searchParams.get("identifier")).toBe(
      "com.plexapp.plugins.library",
    );
    expect(ProxiedRequest).toHaveBeenCalledWith(
      url.pathname + url.search,
      "GET",
      {
        "X-Plex-Token": "server",
        accept: "application/json",
      },
      undefined,
      signal,
    );
  },
);

it("publishes an item-scoped synchronization hint only after a successful write", async () => {
  const changes = vi.fn();
  const unsubscribe = subscribeToMediaChanges(changes);
  try {
    (ProxiedRequest as Mock).mockResolvedValueOnce({ status: 403 });
    await expect(setMediaRating(8, "12")).resolves.toBe(false);
    expect(changes).not.toHaveBeenCalled();
    (ProxiedRequest as Mock).mockResolvedValueOnce({ status: 204 });
    await expect(setMediaRating(8, "12")).resolves.toBe(true);
    expect(changes).toHaveBeenCalledWith({
      serverId: "server",
      profileKey: "1:1",
      kind: "item",
      effect: "unknown",
      id: "12",
    });
  } finally {
    unsubscribe();
  }
});

it.each([0, -2, NaN, Infinity, 11])(
  "rejects invalid personal ratings before contacting Plex (%s)",
  async (rating) => {
    await expect(setMediaRating(rating, "12")).rejects.toThrow(
      "Choose a rating",
    );
    expect(ProxiedRequest).not.toHaveBeenCalled();
  },
);

it("rejects a missing session instead of sending an unauthenticated request", async () => {
  AuthStorage.clearActiveSession();
  await expect(setMediaRating(8, "12")).rejects.toThrow("session has expired");
  expect(ProxiedRequest).not.toHaveBeenCalled();
});

it.each(["abort", "profile", "server"])(
  "does not publish a stale write after %s changes",
  async (change) => {
    let finish!: (response: { status: number }) => void;
    (ProxiedRequest as Mock).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const controller = new AbortController();
    const changes = vi.fn();
    const unsubscribe = subscribeToMediaChanges(changes);
    try {
      const pending = setMediaRating(8, "12", controller.signal);
      if (change === "abort") controller.abort();
      else if (change === "profile") useAuthSession.setState({ revision: 2 });
      else
        useServerSession.setState({
          server: { machineIdentifier: "other" } as Plex.ServerPreferences,
        });
      finish({ status: 200 });
      await expect(pending).rejects.toThrow();
      expect(changes).not.toHaveBeenCalled();
    } finally {
      unsubscribe();
    }
  },
);
