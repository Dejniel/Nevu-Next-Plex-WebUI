import type { MediaMetadata } from "entities/media/model";
import { musicAPI, readMusicQueue } from "./music";
import { PlexRequestError } from "shared/api/PlexClient";
const transport = vi.hoisted(() => ({
  post: vi.fn(),
  get: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
}));
vi.mock("shared/api/PlexClient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("shared/api/PlexClient")>()),
  PlexClient: class {
    request(url: string, method: string, body: unknown, signal?: AbortSignal) {
      return method === "PUT"
        ? transport.put(url, body, signal)
        : transport.delete(url, signal);
    }
    post = transport.post;
    get = transport.get;
    put = transport.put;
    delete = transport.delete;
  },
}));
const entry = {
  type: "track",
  ratingKey: "12",
  playQueueItemID: 100,
  title: "Track",
  Media: [{ Part: [{ key: "/library/parts/12/file.flac" }] }],
} as MediaMetadata;
const response = {
  MediaContainer: {
    playQueueID: 3,
    playQueueVersion: 1,
    playQueueSelectedItemID: 100,
    playQueueSelectedItemOffset: 0,
    playQueueTotalCount: 2,
    Metadata: [entry, { ...entry, playQueueItemID: 101 }],
  },
};
beforeEach(() => {
  for (const mock of Object.values(transport)) {
    mock.mockReset();
    mock.mockResolvedValue(response);
  }
});
it("keeps duplicate songs distinct by native queue entry IDs", () => {
  const queue = readMusicQueue(response);
  expect(queue.items.map((item) => item.playQueueItemID)).toEqual([100, 101]);
  expect(() =>
    readMusicQueue({
      MediaContainer: {
        ...response.MediaContainer,
        Metadata: [{ ...entry, type: "movie" }],
      },
    }),
  ).toThrow("invalid music queue");
});
it("creates an album queue at a selected track and reads bounded windows", async () => {
  const api = musicAPI({ "X-Plex-Token": "test-token" }, "server");
  await api.create({ kind: "library", id: "10" }, "12");
  const create = new URL(transport.post.mock.calls[0][0], "http://plex");
  expect(create.searchParams.get("type")).toBe("audio");
  expect(create.searchParams.get("uri")).toBe(
    "server://server/com.plexapp.plugins.library/library/metadata/10",
  );
  expect(create.searchParams.get("key")).toBe("/library/metadata/12");
  await api.get(3, 100);
  expect(
    new URL(transport.get.mock.calls[0][0], "http://plex").searchParams.get(
      "window",
    ),
  ).toBe("50");
});

it("carries the queue operation's cancellation through creation and timeline reporting", async () => {
  const api = musicAPI({}, "server");
  const signal = new AbortController().signal;
  await api.create({ kind: "library", id: "10" }, "12", false, signal);
  expect(transport.post.mock.calls[0][2]).toBe(signal);
  await api.timeline(entry, 3, "playing", 5, 60, signal);
  expect(transport.get.mock.calls[0][1]).toBe(signal);
});
it("uses entry IDs for removal and ordering and native next semantics", async () => {
  const api = musicAPI({}, "server");
  await api.add(3, { kind: "library", id: "12" }, true);
  await api.move(3, 101, 100);
  await api.remove(3, 101);
  expect(transport.put.mock.calls[0][0]).toContain("next=1");
  expect(transport.put.mock.calls[1][0]).toContain("/items/101/move?after=100");
  expect(transport.delete.mock.calls[0][0]).toContain("/items/101");
});

it("plays a saved playlist at the selected song using Plex's native playlist source", async () => {
  const api = musicAPI({ "X-Plex-Token": "test-token" }, "server");
  await api.create({ kind: "playlist", id: "20" }, "12");
  const params = new URL(transport.post.mock.calls[0][0], "http://plex")
    .searchParams;
  expect(params.get("playlistID")).toBe("20");
  expect(params.get("key")).toBe("/library/metadata/12");
  expect(params.get("uri")).toBeNull();
  expect(params.get("window")).toBe("50");
  await api.add(3, { kind: "playlist", id: "20" }, true);
  const add = new URL(transport.put.mock.calls[0][0], "http://plex")
    .searchParams;
  expect(add.get("playlistID")).toBe("20");
  expect(add.get("next")).toBe("1");
  expect(add.get("uri")).toBeNull();
});

it("reads native shuffle state and uses shuffle/unshuffle without creating a different queue", async () => {
  expect(
    readMusicQueue({
      MediaContainer: { ...response.MediaContainer, playQueueShuffled: true },
    }).shuffled,
  ).toBe(true);
  const api = musicAPI({}, "server");
  await api.shuffle(3, true);
  await api.shuffle(3, false);
  expect(transport.put.mock.calls[0][0]).toContain("/playQueues/3/shuffle?");
  expect(transport.put.mock.calls[1][0]).toContain("/playQueues/3/unshuffle?");
  expect(transport.post).not.toHaveBeenCalled();
});

it("reads a bounded window after reset, since Plex's reset response can omit items", async () => {
  transport.put.mockResolvedValue({
    MediaContainer: { ...response.MediaContainer, Metadata: undefined },
  });
  const queue = await musicAPI({}, "server").reset(3);
  expect(transport.put.mock.calls[0][0]).toContain("/playQueues/3/reset?");
  const url = new URL(transport.get.mock.calls[0][0], "http://plex");
  expect(url.searchParams.get("center")).toBeNull();
  expect(url.searchParams.get("window")).toBe("50");
  expect(queue.items).toHaveLength(2);
});

it.each(["add", "remove", "move", "shuffle"] as const)(
  "reads the actual queue after %s instead of caching an empty acknowledgement",
  async (operation) => {
    const empty = {
      MediaContainer: { ...response.MediaContainer, Metadata: undefined },
    };
    transport.put.mockResolvedValue(empty);
    transport.delete.mockResolvedValue(empty);
    const api = musicAPI({}, "server");
    const queue = await (operation === "add"
      ? api.add(3, { kind: "library", id: "12" }, true)
      : operation === "remove"
        ? api.remove(3, 100)
        : operation === "move"
          ? api.move(3, 100, 101)
          : api.shuffle(3, true));
    expect(queue.items).toHaveLength(2);
    expect(transport.get).toHaveBeenCalledTimes(1);
  },
);

it("does not continue a cancelled queue mutation into another read", async () => {
  const abort = new AbortController();
  transport.put.mockImplementation(async () => {
    abort.abort();
    return response;
  });
  await expect(
    musicAPI({}, "server").shuffle(3, true, abort.signal),
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(transport.get).not.toHaveBeenCalled();
});

it("explains a refused native shuffle without reading or replacing the playing queue", async () => {
  transport.put.mockRejectedValue(new PlexRequestError(404, null));
  await expect(musicAPI({}, "server").shuffle(3, true)).rejects.toThrow(
    "Start a new shuffled selection",
  );
  expect(transport.get).not.toHaveBeenCalled();
  expect(transport.post).not.toHaveBeenCalled();
});
