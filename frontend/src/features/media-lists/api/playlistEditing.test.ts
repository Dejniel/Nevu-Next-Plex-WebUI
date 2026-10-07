import {
  AuthStorage,
  useAuthSession,
  useServerSession,
} from "features/session/model";
import { useUserSettings } from "features/settings/model";
import { ProxiedRequest } from "shared/api/backend";
import { editPlaylist, type PlaylistEdit } from "./playlistEditing";

vi.mock("shared/api/backend", () => ({ ProxiedRequest: vi.fn() }));
const transport = vi.mocked(ProxiedRequest);
const signal = () => new AbortController().signal;
const response = (Metadata: unknown[], extra = {}) => ({
  status: 200,
  data: { MediaContainer: { Metadata, ...extra } },
});
const entry = (position: number) => ({
  playlistItemID: String(100 + position),
  position,
});
let total: number;
let smart: boolean;
beforeEach(() => {
  vi.resetAllMocks();
  total = 20_000;
  smart = false;
  AuthStorage.saveActiveSession({
    profile: null,
    accountToken: "account",
    serverToken: "profile-token",
  });
  useAuthSession.setState({ status: "ready", revision: 7 });
  useUserSettings.setState({ profileKey: "owner:2" });
  useServerSession.setState({
    server: { machineIdentifier: "local" } as Plex.ServerPreferences,
    canManageServer: false,
  });
  transport.mockImplementation(async (path, method) => {
    if (method !== "GET") return { status: 204, data: "" };
    const url = new URL(path, "http://plex.test");
    if (url.pathname === "/playlists/20")
      return response([
        {
          ratingKey: "20",
          type: "playlist",
          playlistType: "video",
          title: "Weekend",
          leafCount: total,
          smart,
        },
      ]);
    const position = Number(url.searchParams.get("X-Plex-Container-Start"));
    // The same movie is intentionally repeated; entry IDs are the only identity.
    return response(
      [
        {
          ratingKey: "3",
          type: "movie",
          title: "Movie",
          playlistItemID: 100 + position,
        },
      ],
      { offset: position, totalSize: total },
    );
  });
});

it("saves a trimmed name and description with the ordinary active profile's token", async () => {
  const abort = signal();
  await expect(
    editPlaylist(
      "20",
      { type: "details", title: " New & name ", summary: " " },
      abort,
    ),
  ).resolves.toEqual({
    kind: "list",
    listKind: "playlist",
    id: "20",
    serverId: "local",
    profileKey: "owner:2",
  });
  const [path, method, headers, , forwardedSignal] = transport.mock.calls[1];
  expect(method).toBe("PUT");
  expect(new URL(path, "http://plex.test").searchParams.get("title")).toBe(
    "New & name",
  );
  expect(new URL(path, "http://plex.test").searchParams.get("summary")).toBe(
    "",
  );
  expect(headers?.["X-Plex-Token"]).toBe("profile-token");
  expect(forwardedSignal).toBe(abort);
});

it("removes exactly the selected occurrence and reports playlist deletion separately", async () => {
  await editPlaylist("20", { type: "remove", entry: entry(9) }, signal());
  expect(transport.mock.calls[1].slice(0, 2)).toEqual([
    "/playlists/20/items/109",
    "DELETE",
  ]);
  transport.mockClear();
  await expect(
    editPlaylist("20", { type: "delete" }, signal()),
  ).resolves.toMatchObject({ effect: "removed", id: "20" });
  expect(transport.mock.calls[1].slice(0, 2)).toEqual([
    "/playlists/20",
    "DELETE",
  ]);
});

it.each([
  [9, 0, null],
  [9, 2, "101"],
  [9, 15, "115"],
  [9, 19_999, "20099"],
  [0, 1, "101"],
])(
  "moves position %s to %s using the correct predecessor, without reading intervening pages",
  async (from, to, after) => {
    await editPlaylist(
      "20",
      { type: "move", entry: entry(from), position: to, total },
      signal(),
    );
    const calls = transport.mock.calls;
    expect(calls).toHaveLength(to === 0 ? 3 : 4);
    const [path, method] = calls.at(-1)!;
    const url = new URL(path, "http://plex.test");
    expect(method).toBe("PUT");
    expect(url.pathname).toBe(`/playlists/20/items/${100 + from}/move`);
    expect(url.searchParams.get("after")).toBe(after);
    for (const [read] of calls.slice(1, -1))
      expect(
        new URL(read, "http://plex.test").searchParams.get(
          "X-Plex-Container-Size",
        ),
      ).toBe("1");
  },
);

it("does not write when moving an entry to its current position", async () => {
  await editPlaylist(
    "20",
    { type: "move", entry: entry(9), position: 9, total },
    signal(),
  );
  expect(transport.mock.calls.every(([, method]) => method === "GET")).toBe(
    true,
  );
});

it("uses the confirmed summary count when entry pages omit their total", async () => {
  const defaultRead = transport.getMockImplementation()!;
  transport.mockImplementation(async (...args) => {
    const result = await defaultRead(...args);
    const container = (
      result.data as { MediaContainer?: { totalSize?: number } }
    ).MediaContainer;
    if (container) delete container.totalSize;
    return result;
  });
  await editPlaylist(
    "20",
    { type: "move", entry: entry(9), position: 15, total },
    signal(),
  );
  expect(transport.mock.lastCall?.[1]).toBe("PUT");
});

it.each(["count", "source", "anchor"])(
  "rejects changed %s evidence instead of moving a different repeated title",
  async (changed) => {
    if (changed === "count") total--;
    else {
      const defaultRead = transport.getMockImplementation()!;
      transport.mockImplementation(async (...args) => {
        const result = await defaultRead(...args);
        const metadata = (
          result.data as {
            MediaContainer?: { Metadata?: { playlistItemID?: number }[] };
          }
        ).MediaContainer?.Metadata?.[0];
        const offset = new URL(args[0], "http://plex.test").searchParams.get(
          "X-Plex-Container-Start",
        );
        if (metadata && offset === (changed === "source" ? "9" : "15"))
          metadata.playlistItemID = changed === "source" ? 999 : undefined;
        return result;
      });
    }
    await expect(
      editPlaylist(
        "20",
        { type: "move", entry: entry(9), position: 15, total: 20_000 },
        signal(),
      ),
    ).rejects.toThrow("playlist changed");
    expect(transport.mock.calls.every(([, method]) => method === "GET")).toBe(
      true,
    );
  },
);

it("allows smart playlist details and deletion while forbidding manual membership changes", async () => {
  smart = true;
  for (const edit of [
    { type: "remove", entry: entry(9) },
    { type: "move", entry: entry(9), position: 0, total },
  ] as PlaylistEdit[])
    await expect(editPlaylist("20", edit, signal())).rejects.toThrow(
      "Smart playlists",
    );
  expect(transport.mock.calls.every(([, method]) => method === "GET")).toBe(
    true,
  );
  await editPlaylist(
    "20",
    { type: "details", title: "Smart", summary: "" },
    signal(),
  );
  await editPlaylist("20", { type: "delete" }, signal());
});

it.each(["token", "profile", "server", "revision", "cancel"])(
  "stops writes after a %s change during the validation read",
  async (change) => {
    const controller = new AbortController();
    const defaultRead = transport.getMockImplementation()!;
    transport.mockImplementation(async (...args) => {
      if (change === "token")
        AuthStorage.saveActiveSession({
          profile: null,
          accountToken: "other",
          serverToken: "other",
        });
      if (change === "profile")
        useUserSettings.setState({ profileKey: "owner:3" });
      if (change === "server")
        useServerSession.setState({
          server: { machineIdentifier: "other" } as Plex.ServerPreferences,
        });
      if (change === "revision") useAuthSession.setState({ revision: 8 });
      if (change === "cancel") controller.abort();
      return defaultRead(...args);
    });
    await expect(
      editPlaylist("20", { type: "delete" }, controller.signal),
    ).rejects.toThrow();
    expect(transport).toHaveBeenCalledTimes(1);
  },
);

it.each([401, 403, 404, 503])(
  "retains failed writes (%s) and explains access or missing entries",
  async (status) => {
    const defaultRead = transport.getMockImplementation()!;
    transport.mockImplementation(async (...args) =>
      args[1] === "GET" ? defaultRead(...args) : { status, data: {} },
    );
    await expect(
      editPlaylist("20", { type: "remove", entry: entry(9) }, signal()),
    ).rejects.toThrow(status === 503 ? "503" : "profile");
  },
);

it("rejects malformed identities and out-of-range positions before contacting Plex", async () => {
  for (const [id, edit] of [
    ["../20", { type: "delete" }],
    ["20", { type: "details", title: " ", summary: "" }],
    ["20", { type: "remove", entry: { position: 1 } }],
    ["20", { type: "move", entry: entry(9), position: 1.5, total }],
    ["20", { type: "move", entry: entry(9), position: total, total }],
  ] as [string, PlaylistEdit][])
    await expect(editPlaylist(id, edit, signal())).rejects.toThrow();
  expect(transport).not.toHaveBeenCalled();
});
