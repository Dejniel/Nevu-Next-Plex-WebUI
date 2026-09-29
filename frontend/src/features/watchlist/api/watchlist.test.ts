import axios from "axios";
import { AuthStorage } from "features/session/model";
import {
  addToWatchlist,
  getWatchlist,
  removeFromWatchlist,
} from "./watchlist";

jest.mock("axios");

const mockedAxios = axios as jest.Mocked<typeof axios>;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  jest.clearAllMocks();
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
      params: expect.objectContaining({ "X-Plex-Container-Size": 300 }),
    }),
  );
});

it("fails before a request when no profile token is available", async () => {
  AuthStorage.clearActiveSession();

  await expect(getWatchlist()).rejects.toThrow("account token");
  expect(mockedAxios.get).not.toHaveBeenCalled();
});
