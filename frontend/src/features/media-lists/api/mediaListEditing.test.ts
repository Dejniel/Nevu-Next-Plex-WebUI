import type { Mock } from "vitest";
import { AuthStorage, useServerSession } from "features/session/model";
import { useUserSettings } from "features/settings/model";
import { ProxiedRequest } from "shared/api/backend";
import { getMediaListChoices, saveMediaListItem } from "./mediaLists";
import { subscribeToMediaChanges } from "entities/media/model";
import type { MediaListItem } from "../model/mediaListEditing";

vi.mock("shared/api/backend", () => ({ ProxiedRequest: vi.fn() }));
const transport = ProxiedRequest as Mock;
const movie: MediaListItem = {
  ratingKey: "3",
  title: "Movie",
  type: "movie",
  librarySectionID: 2,
};
const list = (kind: string, extra = {}) => ({
  type: kind,
  ratingKey: "20",
  title: "Weekend",
  playlistType: "video",
  subtype: "movie",
  librarySectionID: 2,
  ...extra,
});
const response = (Metadata: unknown[], extra = {}) => ({
  status: 200,
  data: { MediaContainer: { Metadata, ...extra } },
});
const params = (call: number) =>
  new URL(transport.mock.calls[call][0], "http://plex.test").searchParams;

beforeEach(() => {
  vi.resetAllMocks();
  AuthStorage.saveActiveSession({
    profile: null,
    accountToken: "account",
    serverToken: "server",
  });
  useUserSettings.setState({ profileKey: "owner:1" });
  useServerSession.setState({
    server: { machineIdentifier: "local" } as Plex.ServerPreferences,
    canManageServer: true,
  });
});

it.each(["playlist", "collection"] as const)(
  "creates a regular %s with the item and the active server token",
  async (kind) => {
    transport.mockResolvedValue(
      response([list(kind, { librarySectionID: undefined })]),
    );
    const result = await saveMediaListItem(kind, movie, {
      title: "  Weekend  ",
    });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport.mock.calls[0][1]).toBe("POST");
    expect(transport.mock.calls[0][2]["X-Plex-Token"]).toBe("server");
    expect(params(0).get("uri")).toBe(
      "server://local/com.plexapp.plugins.library/library/metadata/3",
    );
    expect(params(0).get("title")).toBe("Weekend");
    expect(params(0).get("smart")).toBe("0");
    expect(params(0).get("type")).toBe(kind === "playlist" ? "video" : "1");
    expect(params(0).get("sectionId")).toBe(kind === "playlist" ? null : "2");
    expect(result).toMatchObject({ id: "20", title: "Weekend", kind });
    expect(result.libraryID).toBe(kind === "collection" ? "2" : undefined);
  },
);

it.each(["playlist", "collection"] as const)(
  "adds to an existing %s without replacing its contents or tags",
  async (kind) => {
    transport
      .mockResolvedValueOnce(response([list(kind)]))
      .mockResolvedValueOnce({ status: 200, data: {} });
    await saveMediaListItem(kind, movie, { id: "20" });
    expect(transport.mock.calls.map((call) => call[1])).toEqual(["GET", "PUT"]);
    expect(transport.mock.calls[1][0]).toContain(
      kind === "playlist"
        ? "/playlists/20/items?"
        : "/library/collections/20/items?",
    );
    expect([...params(1).keys()]).toEqual(["uri"]);
  },
);

it.each(["playlist", "collection"] as const)(
  "does not manually edit smart %s lists",
  async (kind) => {
    transport.mockResolvedValue(response([list(kind, { smart: 1 })]));
    await expect(saveMediaListItem(kind, movie, { id: "20" })).rejects.toThrow(
      "Smart",
    );
    expect(transport).toHaveBeenCalledTimes(1);
  },
);

it.each([{ librarySectionID: 1 }, { subtype: "show" }])(
  "rejects a collection from the wrong library or of the wrong media type",
  async (extra) => {
    transport.mockResolvedValue(response([list("collection", extra)]));
    await expect(
      saveMediaListItem("collection", movie, { id: "20" }),
    ).rejects.toThrow("same library");
    expect(transport).toHaveBeenCalledTimes(1);
  },
);

it("keeps playlists available to ordinary users while collections require management permission", async () => {
  useServerSession.setState({ canManageServer: false });
  await expect(
    saveMediaListItem("collection", movie, { title: "Weekend" }),
  ).rejects.toThrow("permission");
  expect(transport).not.toHaveBeenCalled();
  transport.mockResolvedValue(response([list("playlist")]));
  await expect(
    saveMediaListItem("playlist", movie, { title: "Weekend" }),
  ).resolves.toMatchObject({ id: "20" });
});

it.each(["token", "profile"])(
  "does not mutate a list after changing the active %s while validating it",
  async (change) => {
    transport.mockImplementation(async () => {
      if (change === "token") {
        AuthStorage.saveActiveSession({
          profile: null,
          accountToken: "other",
          serverToken: "other",
        });
      } else {
        useUserSettings.setState({ profileKey: "owner:2" });
      }
      return response([list("playlist")]);
    });
    await expect(
      saveMediaListItem("playlist", movie, { id: "20" }),
    ).rejects.toThrow("profile changed");
    expect(transport).toHaveBeenCalledTimes(1);
  },
);

it("publishes changes only after a successful mutation for the active profile", async () => {
  const changed = vi.fn();
  const unsubscribe = subscribeToMediaChanges(changed);
  try {
    transport.mockResolvedValue({ status: 403, data: {} });
    await expect(
      saveMediaListItem("playlist", movie, { title: "Weekend" }),
    ).rejects.toThrow("403");
    expect(changed).not.toHaveBeenCalled();
    transport.mockResolvedValue(response([list("playlist")]));
    await saveMediaListItem("playlist", movie, { title: "Weekend" });
    expect(changed.mock.calls[0][0]).toEqual({
      kind: "list",
      listKind: "playlist",
      id: "20",
      serverId: "local",
      profileKey: "owner:1",
    });
  } finally {
    unsubscribe();
  }
});

it("reads choices beyond the first page and retains smart lists so the selector can explain them", async () => {
  transport.mockImplementation(async (url: string) => {
    const start = Number(
      new URL(url, "http://plex.test").searchParams.get(
        "X-Plex-Container-Start",
      ),
    );
    return response(
      Array.from({ length: Math.min(100, 102 - start) }, (_, index) =>
        list("playlist", {
          ratingKey: String(start + index),
          smart: index === 0,
        }),
      ),
      { offset: start, totalSize: 102 },
    );
  });
  const choices = await getMediaListChoices(
    "playlist",
    movie,
    new AbortController().signal,
  );
  expect(choices).toHaveLength(102);
  expect(choices[101].id).toBe("101");
  expect(choices[0].smart).toBe(true);
  expect(transport).toHaveBeenCalledTimes(2);
});

it("rejects invalid local items, names and collection library IDs before mutation", async () => {
  await expect(
    saveMediaListItem("playlist", movie, { title: "   " }),
  ).rejects.toThrow("name");
  await expect(
    saveMediaListItem(
      "playlist",
      { ...movie, ratingKey: "discover-id" },
      { title: "Weekend" },
    ),
  ).rejects.toThrow("cannot be added");
  await expect(
    saveMediaListItem(
      "collection",
      { ...movie, librarySectionID: undefined },
      { title: "Weekend" },
    ),
  ).rejects.toThrow("Plex library");
  expect(transport).not.toHaveBeenCalled();
});

it.each(["track", "album", "artist"] as const)("creates audio playlists from a %s and reads only compatible choices", async (type) => {
  const item = { ...movie, type };
  transport.mockResolvedValue(response([list("playlist", { playlistType: "audio" })]));
  await expect(saveMediaListItem("playlist", item, { title: "Music" })).resolves.toMatchObject({ playlistType: "audio" });
  expect(params(0).get("type")).toBe("audio");
  transport.mockResolvedValue(response([
    list("playlist", { playlistType: "video", ratingKey: "21" }),
    list("playlist", { playlistType: "audio", ratingKey: "22" }),
  ]));
  const choices = await getMediaListChoices("playlist", item, new AbortController().signal);
  expect(params(1).get("playlistType")).toBe("audio");
  expect(choices.map((choice) => choice.id)).toEqual(["22"]);
});

it.each([
  { type: "track", playlistType: "video" },
  { type: "movie", playlistType: "audio" },
] as const)("rejects mixing $type with a $playlistType playlist before writing", async ({ type, playlistType }) => {
  transport.mockResolvedValue(response([list("playlist", { playlistType })]));
  await expect(saveMediaListItem("playlist", { ...movie, type }, { id: "20" })).rejects.toThrow("same media type");
  expect(transport.mock.calls.map((call) => call[1])).toEqual(["GET"]);
});

it("creates a personal photo album and adds a photo using the shared playlist operations", async () => {
  const photo = { ...movie, type: "photo" as const };
  useServerSession.setState({ canManageServer: false });
  transport.mockResolvedValueOnce(
    response([list("playlist", { playlistType: "photo" })]),
  );
  await expect(
    saveMediaListItem("playlist", photo, { title: "Trip" }),
  ).resolves.toMatchObject({ playlistType: "photo" });
  expect(params(0).get("type")).toBe("photo");
  expect(params(0).get("uri")).toBe(
    "server://local/com.plexapp.plugins.library/library/metadata/3",
  );
  transport
    .mockResolvedValueOnce(
      response([list("playlist", { playlistType: "photo" })]),
    )
    .mockResolvedValueOnce({ status: 200, data: {} });
  await saveMediaListItem("playlist", photo, { id: "20" });
  expect(transport.mock.calls[2].slice(0, 2)).toEqual([
    expect.stringContaining("/playlists/20/items?"),
    "PUT",
  ]);
});

it("offers only photo albums for photos and refuses mixing an existing music playlist", async () => {
  const photo = { ...movie, type: "photo" as const };
  transport.mockResolvedValue(
    response([
      list("playlist", { playlistType: "video", ratingKey: "21" }),
      list("playlist", { playlistType: "audio", ratingKey: "22" }),
      list("playlist", { playlistType: "photo", ratingKey: "23" }),
    ]),
  );
  const choices = await getMediaListChoices(
    "playlist",
    photo,
    new AbortController().signal,
  );
  expect(params(0).get("playlistType")).toBe("photo");
  expect(choices.map((choice) => choice.id)).toEqual(["23"]);
  transport.mockResolvedValue(
    response([list("playlist", { playlistType: "audio" })]),
  );
  await expect(
    saveMediaListItem("playlist", photo, { id: "20" }),
  ).rejects.toThrow("same media type");
  expect(transport.mock.calls.map((call) => call[1])).toEqual(["GET", "GET"]);
});
