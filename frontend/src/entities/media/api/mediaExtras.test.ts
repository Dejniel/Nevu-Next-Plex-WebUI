import axios from "axios";
import { AuthStorage } from "features/session/model";
import { resolveDiscoverExtra } from "./mediaExtras";
import type { TitleExtra } from "../model/mediaExtras";

jest.mock("axios");
jest.mock("shared/api/backend", () => ({
  getBackendURL: () => "http://backend",
}));

const mockedAxios = axios as jest.Mocked<typeof axios>;
const path = "/library/metadata/abcdef/extras/123abc/parts/hls.m3u8";
const extra: TitleExtra = {
  source: "discover",
  metadata: {
    Media: [{ Part: [{ key: path }] }],
  } as Plex.Metadata,
};

beforeEach(() => {
  jest.resetAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  AuthStorage.saveActiveSession({
    profile: null,
    accountToken: "account-token",
    serverToken: "server-token",
  });
});

it("resolves Discover trailers with the account token instead of requesting local playback", async () => {
  mockedAxios.post.mockResolvedValue({
    data: { url: "https://cdn/trailer.m3u8" },
  });

  await expect(resolveDiscoverExtra(extra)).resolves.toEqual({
    id: path,
    url: "https://cdn/trailer.m3u8",
    type: "hls",
  });
  expect(mockedAxios.post).toHaveBeenCalledTimes(1);
  expect(mockedAxios.post).toHaveBeenCalledWith(
    "http://backend/discover/stream",
    { path },
    {
      headers: {
        "X-Plex-Token": "account-token",
        "X-Plex-Client-Identifier": "nevu-web",
      },
    },
  );
});

it("reports the HTTP status without exposing upstream URLs or tokens", async () => {
  mockedAxios.isAxiosError.mockReturnValue(true);
  mockedAxios.post.mockRejectedValue({
    response: { status: 502, data: "https://upstream?token=private" },
  });

  await expect(resolveDiscoverExtra(extra)).rejects.toThrow(
    "Plex Discover could not prepare this extra (HTTP 502). Please try again.",
  );
});

it("rejects extras without a playable part before making a request", async () => {
  await expect(
    resolveDiscoverExtra({ ...extra, metadata: {} as Plex.Metadata }),
  ).rejects.toThrow("This extra does not have a playable stream.");
  expect(mockedAxios.post).not.toHaveBeenCalled();
});

it("rejects an empty stream response", async () => {
  mockedAxios.post.mockResolvedValue({ data: {} });

  await expect(resolveDiscoverExtra(extra)).rejects.toThrow(
    "Plex Discover did not return a stream.",
  );
});
