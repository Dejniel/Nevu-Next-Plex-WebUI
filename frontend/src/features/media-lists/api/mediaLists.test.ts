import { AuthStorage, useServerSession } from "features/session/model";
import { ProxiedRequest } from "shared/api/backend";
import { createMediaListSource, getPlaylistQueue } from "./mediaLists";

jest.mock("shared/api/backend", () => ({ ProxiedRequest: jest.fn() }));
const transport = ProxiedRequest as jest.Mock;
const movie = (id: string, playlistItemID?: number) => ({
  ratingKey: id,
  type: "movie",
  title: id,
  playlistItemID,
});
const response = (Metadata: unknown[], extra = {}) => ({
  status: 200,
  data: { MediaContainer: { Metadata, ...extra } },
});

beforeEach(() => {
  jest.resetAllMocks();
  AuthStorage.saveActiveSession({
    profile: null,
    accountToken: "account",
    serverToken: "server",
  });
  useServerSession.setState({
    server: { machineIdentifier: "local" } as Plex.ServerPreferences,
  });
});

it("reads collection and video-playlist indexes through their own endpoints", async () => {
  transport
    .mockResolvedValueOnce(
      response([
        {
          type: "collection",
          ratingKey: "10",
          title: "Series",
          childCount: 3,
          thumb: "/cover",
          smart: 1,
        },
      ]),
    )
    .mockResolvedValueOnce(
      response([
        {
          type: "playlist",
          playlistType: "video",
          ratingKey: "20",
          title: "Weekend",
          leafCount: 5,
          composite: "/composite",
        },
      ]),
    );
  const collections = await createMediaListSource({
    kind: "collection",
    libraryID: "2",
    search: "Series",
    sort: "addedAt:desc",
  }).page(0, 100);
  const playlists = await createMediaListSource({ kind: "playlist" }).page(
    0,
    100,
  );
  expect(collections.items[0]).toMatchObject({
    kind: "collection",
    id: "10",
    count: 3,
    smart: true,
    image: "/cover",
  });
  expect(playlists.items[0]).toMatchObject({
    kind: "playlist",
    id: "20",
    count: 5,
    image: "/composite",
  });
  expect(transport.mock.calls[0][0]).toContain(
    "/library/sections/2/collections?",
  );
  expect(transport.mock.calls[0][0]).toContain("title=Series");
  expect(transport.mock.calls[1][0]).toContain("playlistType=video");
});

it("retains playlist positions and distinct occurrences of the same media", async () => {
  transport.mockResolvedValue(
    response([movie("1", 80), movie("1", 81)], { offset: 100, totalSize: 102 }),
  );
  const page = await createMediaListSource({
    kind: "playlist",
    id: "20",
    search: "ignored",
    sort: "addedAt:desc",
  }).page(100, 100);
  expect(page.total).toBe(102);
  expect(page.items).toMatchObject([
    { position: 100, playlistItemID: "80" },
    { position: 101, playlistItemID: "81" },
  ]);
  expect(transport.mock.calls[0][0]).toContain("/playlists/20/items?");
  expect(transport.mock.calls[0][0]).not.toMatch(/title=|sort=/);
});

it("fills collection library IDs and keeps foreign or unsupported items unavailable", async () => {
  transport.mockResolvedValue(
    response(
      [
        movie("1"),
        { ...movie("2"), sourceURI: "server://other/library/metadata/2" },
        { ...movie("3"), type: "track" },
      ],
      { librarySectionID: 4 },
    ),
  );
  const page = await createMediaListSource({
    kind: "collection",
    id: "10",
  }).page(0, 100);
  expect(page.items).toMatchObject([
    { supported: true, item: { librarySectionID: 4 } },
    { supported: false },
    { supported: false },
  ]);
});

it("captures the active token for the complete source instead of switching profiles mid-request", async () => {
  const source = createMediaListSource({ kind: "playlist", id: "20" });
  AuthStorage.saveActiveSession({
    profile: null,
    accountToken: "other",
    serverToken: "other",
  });
  transport.mockResolvedValue(response([movie("1")]));
  await source.page(0, 100);
  expect(transport.mock.calls[0][2]["X-Plex-Token"]).toBe("server");
});

it("surfaces forbidden, malformed and incomplete pages instead of loading forever", async () => {
  const source = createMediaListSource({ kind: "playlist" });
  transport.mockResolvedValue({ status: 403, data: {} });
  await expect(source.page(0, 100)).rejects.toThrow("403");
  transport.mockResolvedValue({ status: 200, data: {} });
  await expect(source.page(0, 100)).rejects.toThrow("invalid");
  transport.mockResolvedValue(response([], { totalSize: 101, offset: 100 }));
  await expect(source.page(100, 100)).rejects.toThrow("incomplete");
  transport.mockResolvedValue(response([], { totalSize: 0, offset: 0 }));
  await expect(source.page(100, 100)).rejects.toThrow("incomplete");
});

it("loads only the current and next playlist positions and rejects a changed order", async () => {
  transport.mockResolvedValue(
    response([movie("5"), movie("2")], { offset: 8, totalSize: 20 }),
  );
  await expect(
    getPlaylistQueue({ id: "20", index: 8 }, "5"),
  ).resolves.toMatchObject([{ ratingKey: "5" }, { ratingKey: "2" }]);
  expect(transport.mock.calls[0][0]).toContain("X-Plex-Container-Start=8");
  expect(transport.mock.calls[0][0]).toContain("X-Plex-Container-Size=2");
  await expect(getPlaylistQueue({ id: "20", index: 8 }, "99")).rejects.toThrow(
    "changed",
  );
});

it("does not silently skip an unplayable next item", async () => {
  transport.mockResolvedValue(
    response([movie("1"), { ...movie("2"), type: "track" }], { totalSize: 2 }),
  );
  await expect(getPlaylistQueue({ id: "20", index: 0 }, "1")).rejects.toThrow(
    "cannot be played",
  );
});
