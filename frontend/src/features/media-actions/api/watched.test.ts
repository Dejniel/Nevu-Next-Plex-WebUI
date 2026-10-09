import {
  AuthStorage,
  capturePlexSession,
  useAuthSession,
  useServerSession,
} from "features/session/model";
import { publishMediaChange } from "entities/media/model";
import { ProxiedRequest } from "shared/api/backend";
import { createWatchedAction, WatchedActionError } from "./watched";

vi.mock("shared/api/backend", () => ({
  ProxiedRequest: vi.fn(),
  getBackendURL: () => "",
}));
vi.mock("entities/media/model/mediaChanges", async (original) => ({
  ...(await original<typeof import("entities/media/model/mediaChanges")>()),
  publishMediaChange: vi.fn(),
}));
const transport = vi.mocked(ProxiedRequest);
const ids = () =>
  transport.mock.calls.map(([path]) =>
    new URL(path, "https://plex.test").searchParams.get("key"),
  );
beforeEach(() => {
  vi.resetAllMocks();
  AuthStorage.saveActiveSession({
    profile: null,
    accountToken: "account",
    serverToken: "original-token",
  });
  useAuthSession.setState({
    status: "ready",
    revision: 1,
    ownerUser: { id: 1 } as Plex.UserData,
    activeProfile: {
      id: 2,
      isOwner: false,
      restricted: true,
      protected: false,
      title: "Managed",
    },
    activeUser: { id: 2, restricted: true } as Plex.UserData,
  });
  useServerSession.setState({
    server: { machineIdentifier: "server" } as Plex.ServerPreferences,
    canManageServer: false,
  });
  transport.mockResolvedValue({ status: 200, data: {} });
});

it("supports a managed user and deduplicates playlist occurrences without predicting watched state", async () => {
  const action = createWatchedAction(capturePlexSession());
  const signal = new AbortController().signal;
  await action(true, ["12", "12", "13"], signal);
  expect(ids()).toEqual(["12", "13"]);
  for (const [path, method, headers, body, actualSignal] of transport.mock
    .calls) {
    const url = new URL(path, "https://plex.test");
    expect(url.pathname).toBe("/:/scrobble");
    expect(url.searchParams.get("X-Plex-Token")).toBe("original-token");
    expect(url.searchParams.get("identifier")).toBe(
      "com.plexapp.plugins.library",
    );
    expect(method).toBe("GET");
    expect(headers?.["X-Plex-Token"]).toBe("original-token");
    expect(body).toBeUndefined();
    expect(actualSignal).toBe(signal);
  }
  expect(publishMediaChange).toHaveBeenCalledTimes(2);
  expect(publishMediaChange).toHaveBeenCalledWith({
    serverId: "server",
    profileKey: "1:2",
    kind: "item",
    effect: "unknown",
    id: "12",
  });
});

it("reports exactly the failed IDs and reconciles even a rejected write", async () => {
  transport.mockImplementation(async (path) => ({
    status: path.includes("key=13&") ? 403 : 200,
    data: {},
  }));
  const action = createWatchedAction(capturePlexSession());
  const error = await action(
    false,
    ["12", "13"],
    new AbortController().signal,
  ).catch((error: unknown) => error);
  expect(error).toBeInstanceOf(WatchedActionError);
  expect(error).toMatchObject({ failedIds: ["13"] });
  expect((error as Error).message).toContain("HTTP 403");
  expect(
    transport.mock.calls.every(([path]) => path.startsWith("/:/unscrobble?")),
  ).toBe(true);
  expect(publishMediaChange).toHaveBeenCalledTimes(2);
});

it.each(["token", "profile", "server", "revision", "status"] as const)(
  "rejects an old session after changing %s before confirmation",
  async (change) => {
    const action = createWatchedAction(capturePlexSession());
    if (change === "token")
      AuthStorage.saveActiveSession({
        profile: null,
        accountToken: "new-account",
        serverToken: "new-token",
      });
    if (change === "profile")
      useAuthSession.setState({
        activeProfile: {
          id: 3,
          isOwner: false,
          restricted: false,
          protected: false,
          title: "Another",
        },
      });
    if (change === "server")
      useServerSession.setState({
        server: { machineIdentifier: "other" } as Plex.ServerPreferences,
      });
    if (change === "revision") useAuthSession.setState({ revision: 2 });
    if (change === "status")
      useAuthSession.setState({ status: "selectingProfile" });
    await expect(
      action(true, ["12"], new AbortController().signal),
    ).rejects.toThrow("session changed");
    expect(transport).not.toHaveBeenCalled();
    expect(publishMediaChange).not.toHaveBeenCalled();
  },
);

it("bounds concurrent writes and aborts queued work while reconciling submitted IDs", async () => {
  const finish: Array<() => void> = [];
  transport.mockImplementation(
    () =>
      new Promise((resolve) =>
        finish.push(() => resolve({ status: 200, data: {} })),
      ),
  );
  const controller = new AbortController();
  const result = createWatchedAction(capturePlexSession())(
    true,
    Array.from({ length: 12 }, (_, index) => String(index)),
    controller.signal,
  ).catch((error: unknown) => error);
  expect(transport).toHaveBeenCalledTimes(4);
  controller.abort();
  finish.forEach((resolve) => resolve());
  expect(await result).toMatchObject({ name: "AbortError" });
  expect(transport).toHaveBeenCalledTimes(4);
  expect(publishMediaChange).toHaveBeenCalledTimes(4);
});

it("does not issue queued writes under a replacement session even without UI cancellation", async () => {
  const finish: Array<() => void> = [];
  transport.mockImplementation(
    () =>
      new Promise((resolve) =>
        finish.push(() => resolve({ status: 200, data: {} })),
      ),
  );
  const result = createWatchedAction(capturePlexSession())(
    true,
    Array.from({ length: 8 }, (_, index) => String(index)),
    new AbortController().signal,
  ).catch((error: unknown) => error);
  useAuthSession.setState({ revision: 2 });
  finish.forEach((resolve) => resolve());
  expect(((await result) as Error).message).toContain("session changed");
  expect(transport).toHaveBeenCalledTimes(4);
  expect(publishMediaChange).toHaveBeenCalledTimes(4);
  expect(
    transport.mock.calls.every(
      ([, , headers]) => headers?.["X-Plex-Token"] === "original-token",
    ),
  ).toBe(true);
});

it("does not send or publish an already cancelled or invalid action", async () => {
  const action = createWatchedAction(capturePlexSession());
  const controller = new AbortController();
  controller.abort();
  await expect(action(true, ["12"], controller.signal)).rejects.toThrow();
  await expect(
    action(true, ["12", "plex://movie/13"], new AbortController().signal),
  ).rejects.toThrow("valid Plex");
  expect(transport).not.toHaveBeenCalled();
  expect(publishMediaChange).not.toHaveBeenCalled();
});
