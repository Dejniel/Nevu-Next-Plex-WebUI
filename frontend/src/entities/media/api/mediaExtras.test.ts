import type { Mocked } from "vitest";
import axios from "axios";
import { AuthStorage } from "features/session/model";
import { resolveDiscoverExtra, fetchDiscoverExtras } from "./mediaExtras";
import type { TitleExtra } from "../model/mediaExtras";

vi.mock("axios");
vi.mock("shared/api/backend", async () => ({
  ...(await vi.importActual<typeof import("shared/api/backend")>("shared/api/backend")),
  getBackendURL: () => "http://backend",
}));

const mockedAxios = axios as Mocked<typeof axios>;
const path = "/library/metadata/abcdef/extras/123abc/parts/hls.m3u8";
const extra: TitleExtra = {
  source: "discover",
  metadata: {
    Media: [{ Part: [{ key: path }] }],
  } as Plex.Metadata,
};

beforeEach(() => {
  vi.resetAllMocks();
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
  await expect(resolveDiscoverExtra({ ...extra, metadata: {} as Plex.Metadata })).rejects.toThrow(
    "This extra does not have a playable stream.",
  );
  expect(mockedAxios.post).not.toHaveBeenCalled();
});

it("rejects an empty stream response", async () => {
  mockedAxios.post.mockResolvedValue({ data: {} });

  await expect(resolveDiscoverExtra(extra)).rejects.toThrow(
    "Plex Discover did not return a stream.",
  );
});

it("passes cancellation to the Discover extras request", async () => {
  mockedAxios.post.mockResolvedValue({ data: { MediaContainer: { Metadata: [] } } });
  const signal = new AbortController().signal;
  await fetchDiscoverExtras({ guid: "plex://movie/5d776824f617c900201df022" }, signal);
  expect(mockedAxios.post.mock.calls[0][2]?.signal).toBe(signal);
});
