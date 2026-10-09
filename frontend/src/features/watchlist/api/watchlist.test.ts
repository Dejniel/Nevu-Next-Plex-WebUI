import type { MediaMetadata } from "entities/media/model";
import type { Mocked } from "vitest";
import axios from "axios";
import { AuthStorage } from "features/session/model";
import { addToWatchlist, getWatchlist, removeFromWatchlist } from "./watchlist";

vi.mock("axios");

const mockedAxios = axios as Mocked<typeof axios>;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.clearAllMocks();
  AuthStorage.saveActiveSession({
    profile: null,
    accountToken: "account-token",
    serverToken: "server-token",
  });
});

it("uses the account token and Discover id for watchlist mutations", async () => {
  mockedAxios.put.mockResolvedValue({});

  await addToWatchlist("plex://movie/abc123");
  await removeFromWatchlist("plex://movie/abc123");

  expect(mockedAxios.put).toHaveBeenNthCalledWith(
    1,
    "https://discover.provider.plex.tv/actions/addToWatchlist",
    {},
    {
      headers: { "X-Plex-Token": "account-token" },
      params: { ratingKey: "abc123" },
    },
  );
  expect(mockedAxios.put).toHaveBeenNthCalledWith(
    2,
    "https://discover.provider.plex.tv/actions/removeFromWatchlist",
    {},
    {
      headers: { "X-Plex-Token": "account-token" },
      params: { ratingKey: "abc123" },
    },
  );
});

it("returns an empty list when Plex omits watchlist metadata", async () => {
  mockedAxios.get.mockResolvedValue({ data: { MediaContainer: {} } });

  await expect(getWatchlist()).resolves.toEqual([]);
  expect(mockedAxios.get).toHaveBeenCalledWith(
    "https://discover.provider.plex.tv/library/sections/watchlist/all",
    expect.objectContaining({
      headers: { "X-Plex-Token": "account-token" },
      params: expect.objectContaining({ "X-Plex-Container-Size": 100 }),
    }),
  );
});

it.each([
  "plex://episode/123",
  "plex://season/123",
  "com.plexapp.agents.none://local?lang=en",
  "invalid",
])(
  "rejects unsupported Watchlist identifier %s before a mutation",
  async (guid) => {
    await expect(addToWatchlist(guid)).rejects.toThrow("identifier");
    await expect(removeFromWatchlist(guid)).rejects.toThrow("identifier");
    expect(mockedAxios.put).not.toHaveBeenCalled();
  },
);

it("fails before a request when no profile token is available", async () => {
  AuthStorage.clearActiveSession();

  await expect(getWatchlist()).rejects.toThrow("account token");
  expect(mockedAxios.get).not.toHaveBeenCalled();
});

const movies = (count: number, start = 0) =>
  Array.from(
    { length: count },
    (_, index) =>
      ({
        guid: `plex://movie/${start + index}`,
        ratingKey: String(start + index),
      }) as MediaMetadata,
  );

it("loads a Watchlist larger than 300 using accepted 100-item pages", async () => {
  const items = movies(305);
  mockedAxios.get.mockImplementation(async (_, options) => {
    const params = options?.params as Record<string, number>;
    const start = params["X-Plex-Container-Start"];
    return {
      data: {
        MediaContainer: {
          totalSize: 305,
          Metadata: items.slice(start, start + 100),
        },
      },
    };
  });
  await expect(getWatchlist()).resolves.toEqual(items);
  expect(mockedAxios.get).toHaveBeenCalledTimes(4);
});

it("loads every page and keeps the captured profile token", async () => {
  const first = movies(100);
  const last = movies(4, 100);
  mockedAxios.get
    .mockImplementationOnce(async () => {
      AuthStorage.saveActiveSession({
        profile: null,
        accountToken: "next-account",
        serverToken: "next-server",
      });
      return { data: { MediaContainer: { totalSize: 104, Metadata: first } } };
    })
    .mockResolvedValueOnce({
      data: { MediaContainer: { totalSize: 104, Metadata: last } },
    });

  await expect(getWatchlist()).resolves.toEqual([...first, ...last]);
  expect(mockedAxios.get).toHaveBeenNthCalledWith(
    2,
    expect.any(String),
    expect.objectContaining({
      headers: { "X-Plex-Token": "account-token" },
      params: expect.objectContaining({ "X-Plex-Container-Start": 100 }),
    }),
  );
});

it("continues without totalSize and removes duplicate GUIDs between pages", async () => {
  const first = movies(100);
  mockedAxios.get
    .mockResolvedValueOnce({ data: { MediaContainer: { Metadata: first } } })
    .mockResolvedValueOnce({
      data: { MediaContainer: { Metadata: [first[99], ...movies(2, 100)] } },
    });

  await expect(getWatchlist()).resolves.toHaveLength(102);
});

it("rejects incomplete pagination rather than replacing the list with a partial result", async () => {
  mockedAxios.get
    .mockResolvedValueOnce({
      data: { MediaContainer: { totalSize: 101, Metadata: movies(100) } },
    })
    .mockResolvedValueOnce({ data: { MediaContainer: { totalSize: 101 } } });
  await expect(getWatchlist()).rejects.toThrow("remaining watchlist");
});

it("passes cancellation to every page and rejects a failed later page", async () => {
  const controller = new AbortController();
  mockedAxios.get
    .mockResolvedValueOnce({
      data: { MediaContainer: { totalSize: 101, Metadata: movies(100) } },
    })
    .mockRejectedValueOnce(new Error("offline"));
  await expect(getWatchlist(controller.signal)).rejects.toThrow("offline");
  for (const [, options] of mockedAxios.get.mock.calls)
    expect(options?.signal).toBe(controller.signal);
});

it("rejects a repeated final page even if its raw offset reaches totalSize", async () => {
  mockedAxios.get.mockResolvedValue({
    data: { MediaContainer: { totalSize: 101, Metadata: movies(100) } },
  });
  await expect(getWatchlist()).rejects.toThrow("remaining watchlist");
  expect(mockedAxios.get).toHaveBeenCalledTimes(2);
});
