import { AuthStorage, useServerSession } from "features/session/model";
import { useUserSettings } from "features/settings/model";
import { ProxiedRequest } from "shared/api/backend";
import { getMediaListChoices, saveMediaListItem } from "./mediaLists";
import { MEDIA_LISTS_CHANGED_EVENT } from "../model/mediaLists";
import type { MediaListItem } from "../model/mediaListEditing";

jest.mock("shared/api/backend", () => ({ ProxiedRequest: jest.fn() }));
const transport = ProxiedRequest as jest.Mock;
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
  jest.resetAllMocks();
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
    if (kind === "collection") expect(result.libraryID).toBe("2");
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
  const changed = jest.fn();
  window.addEventListener(MEDIA_LISTS_CHANGED_EVENT, changed);
  try {
    transport.mockResolvedValue({ status: 403, data: {} });
    await expect(
      saveMediaListItem("playlist", movie, { title: "Weekend" }),
    ).rejects.toThrow("403");
    expect(changed).not.toHaveBeenCalled();
    transport.mockResolvedValue(response([list("playlist")]));
    await saveMediaListItem("playlist", movie, { title: "Weekend" });
    expect(changed.mock.calls[0][0].detail).toEqual({
      kind: "playlist",
      id: "20",
      libraryID: "2",
      profileKey: "owner:1",
    });
  } finally {
    window.removeEventListener(MEDIA_LISTS_CHANGED_EVENT, changed);
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
