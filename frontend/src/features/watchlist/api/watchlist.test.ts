import type { DiscoverTitle } from "entities/media/model";
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
        type: "movie",
        title: `Movie ${start + index}`,
      }) satisfies DiscoverTitle,
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
  await expect(getWatchlist()).rejects.toThrow("incomplete watchlist");
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
  await expect(getWatchlist()).rejects.toThrow("incomplete watchlist");
  expect(mockedAxios.get).toHaveBeenCalledTimes(2);
});

it.each([
  { MediaContainer: null },
  { MediaContainer: [] },
  { MediaContainer: { Metadata: {} } },
  { MediaContainer: { Metadata: null } },
  { MediaContainer: { totalSize: "1" } },
  { MediaContainer: { totalSize: -1 } },
  { MediaContainer: { offset: "0" } },
  { MediaContainer: { size: 2, Metadata: movies(1) } },
])("rejects malformed watchlist envelopes and pagination: %j", async (data) => {
  mockedAxios.get.mockResolvedValue({ data });
  await expect(getWatchlist()).rejects.toThrow("invalid");
});

it.each([
  { guid: undefined },
  { guid: 42 },
  { guid: "plex://movie/" },
  { guid: "plex://show/0" },
  { type: "episode" },
  { title: undefined },
  { title: 3 },
  { ratingKey: undefined },
  { year: "2024" },
  { thumb: 42 },
])("rejects malformed watchlist entries: %j", async (invalid) => {
  mockedAxios.get.mockResolvedValue({
    data: { MediaContainer: { Metadata: [{ ...movies(1)[0], ...invalid }] } },
  });
  await expect(getWatchlist()).rejects.toThrow("invalid");
});

it("fails the complete read when a later page contains invalid entries", async () => {
  mockedAxios.get
    .mockResolvedValueOnce({
      data: { MediaContainer: { totalSize: 101, Metadata: movies(100) } },
    })
    .mockResolvedValueOnce({
      data: {
        MediaContainer: {
          totalSize: 101,
          Metadata: [{ ...movies(1, 100)[0], guid: "local-only" }],
        },
      },
    });
  await expect(getWatchlist()).rejects.toThrow("identity");
});

it("continues through capped pages when Plex supplies a total", async () => {
  mockedAxios.get.mockImplementation(async (_, options) => {
    const offset = (options!.params as Record<string, number>)[
      "X-Plex-Container-Start"
    ];
    return {
      data: {
        MediaContainer: {
          offset,
          totalSize: 5,
          Metadata: movies(5).slice(offset, offset + 2),
        },
      },
    };
  });
  await expect(getWatchlist()).resolves.toEqual(movies(5));
  expect(mockedAxios.get).toHaveBeenCalledTimes(3);
});

it.each([
  { offset: 0, totalSize: 101, Metadata: movies(1, 100) },
  { offset: 100, totalSize: 102, Metadata: movies(1, 100) },
])("rejects displaced or changed pagination: %j", async (container) => {
  mockedAxios.get
    .mockResolvedValueOnce({
      data: {
        MediaContainer: { offset: 0, totalSize: 101, Metadata: movies(100) },
      },
    })
    .mockResolvedValueOnce({ data: { MediaContainer: container } });
  await expect(getWatchlist()).rejects.toThrow("incomplete");
});

it("does not request an already cancelled Watchlist or continue after cancellation", async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(getWatchlist(controller.signal)).rejects.toMatchObject({
    name: "AbortError",
  });
  expect(mockedAxios.get).not.toHaveBeenCalled();
  const next = new AbortController();
  mockedAxios.get.mockImplementationOnce(async () => {
    next.abort();
    return {
      data: { MediaContainer: { totalSize: 101, Metadata: movies(100) } },
    };
  });
  await expect(getWatchlist(next.signal)).rejects.toMatchObject({
    name: "AbortError",
  });
  expect(mockedAxios.get).toHaveBeenCalledTimes(1);
});
