import { musicAPI, readMusicQueue } from "./music";
const transport = vi.hoisted(() => ({
  post: vi.fn(),
  get: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
}));
vi.mock("shared/api/PlexClient", () => ({
  PlexClient: class {
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
} as Plex.Metadata;
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
  await api.create("10", "12");
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
it("uses entry IDs for removal and ordering and native next semantics", async () => {
  const api = musicAPI({}, "server");
  await api.add(3, "12", true);
  await api.move(3, 101, 100);
  await api.remove(3, 101);
  expect(transport.put.mock.calls[0][0]).toContain("next=1");
  expect(transport.put.mock.calls[1][0]).toContain("/items/101/move?after=100");
  expect(transport.delete.mock.calls[0][0]).toContain("/items/101");
});
