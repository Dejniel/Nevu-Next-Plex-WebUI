import {
  AuthStorage,
  useAuthSession,
  useServerSession,
} from "features/session/model";
import { subscribeToMediaChanges } from "entities/media/model";
import { ProxiedRequest } from "shared/api/backend";
import { serverQueryClient } from "shared/api/queryClient";
import {
  buildMetadataUpdatePath,
  createMetadataEditor,
  MetadataSaveError,
} from "./metadata";

vi.mock("shared/api/backend", () => ({ ProxiedRequest: vi.fn() }));
const transport = vi.mocked(ProxiedRequest);
const data = {
  ratingKey: "42",
  librarySectionID: 2,
  type: "movie",
  title: "Movie",
  Genre: [{ id: 1, tag: "Drama" }],
  Role: [{ id: 2, tag: "Actor", role: "Character", thumb: "/actor.jpg" }],
};
const signal = () => new AbortController().signal;
beforeEach(() => {
  vi.resetAllMocks();
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
      title: "Owner",
      isOwner: true,
      protected: false,
      restricted: false,
    },
  });
  useServerSession.setState({
    server: { machineIdentifier: "local" } as Plex.ServerPreferences,
    canManageServer: true,
  });
  transport.mockResolvedValue({ status: 200, data: "" });
});
afterEach(() => {
  serverQueryClient.clear();
  vi.unstubAllGlobals();
});

it("writes only edited values and locks and preserves other tag associations", () => {
  const url = new URL(
    buildMetadataUpdatePath(
      data,
      {
        summary: "First line\nSecond line",
        genre: ["Drama", "Name, with comma"],
        actor: ["Actor", "New actor"],
      },
      { genre: true, summary: false },
    ),
    "http://plex",
  );
  expect(url.pathname).toBe("/library/sections/2/all");
  expect(url.searchParams.get("type")).toBe("1");
  expect(url.searchParams.get("id")).toBe("42");
  expect(url.searchParams.get("summary.value")).toBe("First line\nSecond line");
  expect(url.searchParams.get("genre[].tag")).toBe("");
  expect(url.searchParams.get("genre[1].tag.tag")).toBe("Name, with comma");
  expect(url.searchParams.get("actor[0].tagging.text")).toBe("Character");
  expect(url.searchParams.get("actor[1].tagging.text")).toBeNull();
  expect(url.searchParams.get("label[].tag")).toBeNull();
  expect(url.searchParams.get("title.value")).toBeNull();
});

it("explicitly clears an edited tag field without clearing other fields", () => {
  const url = new URL(
    buildMetadataUpdatePath(data, { genre: [] }),
    "http://plex",
  );
  expect([...url.searchParams]).toEqual([
    ["type", "1"],
    ["id", "42"],
    ["genre[].tag", ""],
  ]);
});

it("uses the native sort-title name for both writes and locks", () => {
  const url = new URL(
    buildMetadataUpdatePath(data, { titleSort: "Sorted" }, { titleSort: true }),
    "http://plex",
  );
  expect(url.searchParams.get("titleSort.value")).toBe("Sorted");
  expect(url.searchParams.get("titleSort.locked")).toBe("1");
});

it("uses the artist identity when renaming an album and native track type for disc numbers", () => {
  const album = new URL(
    buildMetadataUpdatePath(
      { ...data, type: "album", parentRatingKey: "7" },
      { title: "Album" },
    ),
    "http://plex",
  );
  expect(album.searchParams.get("artist.id.value")).toBe("7");
  expect(album.searchParams.get("type")).toBe("9");
  const track = new URL(
    buildMetadataUpdatePath({ ...data, type: "track" }, { parentIndex: "2" }),
    "http://plex",
  );
  expect(track.searchParams.get("type")).toBe("10");
  expect(track.searchParams.get("parentIndex.value")).toBe("2");
});

it("preserves current cast characters when editing names after an intervening change", async () => {
  transport.mockResolvedValueOnce({
    status: 200,
    data: {
      MediaContainer: {
        Metadata: [
          { ...data, Role: [{ tag: "Actor", role: "Updated character" }] },
        ],
      },
    },
  });
  await createMetadataEditor(data).save(
    { actor: ["Actor", "New actor"] },
    { actor: true },
    {},
    signal(),
  );
  expect(transport.mock.calls.map((call) => call[1])).toEqual(["GET", "PUT"]);
  const url = new URL(transport.mock.calls[1][0], "http://plex");
  expect(url.searchParams.get("actor[0].tagging.text")).toBe(
    "Updated character",
  );
});

it("does not write artwork or cast names when the current cast cannot be read", async () => {
  transport.mockResolvedValueOnce({ status: 500, data: "" });
  await expect(
    createMetadataEditor(data).save(
      { actor: ["Actor"] },
      {},
      { thumb: { type: "remove" } },
      signal(),
    ),
  ).rejects.toThrow();
  expect(transport.mock.calls.map((call) => call[1])).toEqual(["GET"]);
});

it.each([{}, [null], [{ tag: "Actor", role: {} }]])(
  "rejects malformed fresh cast before any artwork or metadata write (%j)",
  async (Role) => {
    transport.mockResolvedValueOnce({
      status: 200,
      data: {
        MediaContainer: { Metadata: [{ ratingKey: data.ratingKey, Role }] },
      },
    });
    await expect(
      createMetadataEditor(data).save(
        { actor: ["Actor"] },
        {},
        { thumb: { type: "remove" } },
        signal(),
      ),
    ).rejects.toThrow("invalid current cast information");
    expect(transport.mock.calls.map((call) => call[1])).toEqual(["GET"]);
  },
);

it("uses the captured administrator session and applies final locks after artwork", async () => {
  const abort = signal();
  await createMetadataEditor(data).save(
    { title: "New title" },
    { title: true, thumb: false },
    { thumb: { type: "existing", url: "metadata://posters/a", preview: "/a" } },
    abort,
  );
  expect(transport.mock.calls.map((call) => call[1])).toEqual(["PUT", "PUT"]);
  expect(transport.mock.calls[0][0]).toBe(
    "/library/metadata/42/poster?url=metadata%3A%2F%2Fposters%2Fa",
  );
  const [path, , headers, , forwardedSignal] = transport.mock.calls[1];
  expect(path).toContain("thumb.locked=0");
  expect(headers).toMatchObject({
    "X-Plex-Token": "token",
    "X-Plex-Pms-Api-Version": "1.0.0",
  });
  expect(forwardedSignal).toBe(abort);
});

it("streams binary uploads through the existing proxy without wrapping files in JSON", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValue(new Response("", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  const file = new File(["image"], "cover.png", { type: "image/png" });
  const abort = signal();
  await createMetadataEditor({ ...data, type: "album" }).save(
    {},
    { thumb: true },
    { thumb: { type: "file", file } },
    abort,
  );
  expect(fetchMock).toHaveBeenCalledWith(
    "/dynproxy/library/metadata/42/posters",
    expect.objectContaining({
      method: "POST",
      headers: {
        "X-Plex-Token": "token",
        Accept: "application/json",
        "Content-Type": "image/png",
      },
      body: file,
      signal: abort,
    }),
  );
  expect(transport).toHaveBeenCalledTimes(1);
});

it("loads native poster choices with captured credentials and rejects malformed responses", async () => {
  transport.mockResolvedValue({
    status: 200,
    data: {
      MediaContainer: {
        Metadata: [
          {
            ratingKey: "metadata://image",
            thumb: "/preview",
            selected: true,
            provider: "local",
          },
        ],
      },
    },
  });
  const editor = createMetadataEditor(data);
  expect(await editor.artwork("thumb", signal())).toEqual([
    {
      url: "metadata://image",
      preview: "/preview",
      selected: true,
      provider: "local",
    },
  ]);
  transport.mockResolvedValue({ status: 200, data: {} });
  await expect(editor.artwork("art", signal())).rejects.toThrow(
    "invalid artwork",
  );
});

it.each(["profile", "token", "server", "revision"])(
  "rejects editing after the %s changes",
  async (change) => {
    const editor = createMetadataEditor(data);
    if (change === "profile")
      useAuthSession.setState({ activeProfile: { id: 2 } as never });
    if (change === "token")
      AuthStorage.saveActiveSession({
        profile: null,
        accountToken: "other",
        serverToken: "other",
      });
    if (change === "server")
      useServerSession.setState({
        server: { machineIdentifier: "other" } as Plex.ServerPreferences,
      });
    if (change === "revision") useAuthSession.setState({ revision: 2 });
    await expect(
      editor.save({ title: "New" }, {}, {}, signal()),
    ).rejects.toThrow("session changed");
    expect(transport).not.toHaveBeenCalled();
  },
);

it("does not start another write after aborting an artwork operation", async () => {
  const controller = new AbortController();
  transport.mockImplementation(async () => {
    controller.abort();
    return { status: 200, data: "" };
  });
  await expect(
    createMetadataEditor(data).save(
      { summary: "Changed" },
      {},
      {
        thumb: {
          type: "existing",
          url: "metadata://image",
          preview: "/preview",
        },
        art: { type: "remove" },
      },
      controller.signal,
    ),
  ).rejects.toBeInstanceOf(MetadataSaveError);
  expect(transport).toHaveBeenCalledTimes(1);
});

it("reports completed artwork and publishes one refresh after a partial failure", async () => {
  transport
    .mockResolvedValueOnce({ status: 200, data: "" })
    .mockResolvedValueOnce({ status: 403, data: "" });
  const changed = vi.fn();
  const stop = subscribeToMediaChanges(changed);
  try {
    await expect(
      createMetadataEditor(data).save(
        { summary: "Changed" },
        {},
        { thumb: { type: "remove" } },
        signal(),
      ),
    ).rejects.toMatchObject({
      completedArtwork: ["thumb"],
      message: expect.stringContaining("administrator"),
    });
    expect(changed).toHaveBeenCalledTimes(1);
    expect(changed.mock.calls[0][0]).toMatchObject({
      serverId: "local",
      profileKey: "1:1",
      id: "42",
      effect: "unknown",
    });
  } finally {
    stop();
  }
});

it("invalidates the original scope without refetching through a replaced session", async () => {
  const invalidate = vi.spyOn(serverQueryClient, "invalidateQueries");
  transport.mockImplementation(async () => {
    useAuthSession.setState({ revision: 2 });
    return { status: 200, data: "" };
  });
  await expect(
    createMetadataEditor(data).save({ title: "New title" }, {}, {}, signal()),
  ).rejects.toThrow("session changed");
  expect(invalidate).toHaveBeenCalledWith({
    refetchType: "none",
    exact: true,
    queryKey: ["media", "local", "1:1", "42"],
  });
  expect(transport).toHaveBeenCalledTimes(1);
  invalidate.mockRestore();
});

it("requires an unrestricted active user as well as the Plex management permission", async () => {
  useAuthSession.setState({
    activeUser: { id: 1, restricted: true } as Plex.UserData,
  });
  await expect(
    createMetadataEditor(data).save({ title: "New" }, {}, {}, signal()),
  ).rejects.toThrow("administrator");
  expect(transport).not.toHaveBeenCalled();
});

it.each(["ordinary", "invalid-field", "invalid-url"])(
  "validates %s before any mutation",
  async (kind) => {
    if (kind === "ordinary")
      useServerSession.setState({ canManageServer: false });
    const editor = createMetadataEditor({ ...data, type: "photo" });
    await expect(
      editor.save(
        kind === "invalid-field" ? { studio: "Studio" } : {},
        {},
        kind === "invalid-url"
          ? { thumb: { type: "url", url: "file:///image" } }
          : {},
        signal(),
      ),
    ).rejects.toThrow();
    expect(transport).not.toHaveBeenCalled();
  },
);
