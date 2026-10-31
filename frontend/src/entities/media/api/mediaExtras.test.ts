import axios from "axios";
import { AuthStorage } from "features/session/model";
import { resolveDiscoverExtra, fetchDiscoverExtras } from "./mediaExtras";
import type { TitleExtra } from "../model/mediaExtras";

vi.mock("axios");
vi.mock("shared/api/backend", async () => ({
  ...(await vi.importActual<typeof import("shared/api/backend")>(
    "shared/api/backend",
  )),
  getBackendURL: () => "http://backend",
}));

const mockedAxios = vi.mocked(axios);
const path = "/library/metadata/abcdef/extras/123abc/parts/hls.m3u8";
const extra: TitleExtra = {
  source: "discover",
  metadata: {
    ratingKey: "extra",
    title: "Trailer",
    Media: [{ Part: [{ key: path }] }],
  },
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
  await expect(
    resolveDiscoverExtra({
      ...extra,
      metadata: { ratingKey: "extra", title: "Trailer" },
    }),
  ).rejects.toThrow("This extra does not have a playable stream.");
  expect(mockedAxios.post).not.toHaveBeenCalled();
});

it("rejects an empty stream response", async () => {
  mockedAxios.post.mockResolvedValue({ data: {} });

  await expect(resolveDiscoverExtra(extra)).rejects.toThrow(
    "Plex Discover did not return a stream.",
  );
});

it("passes cancellation to the Discover extras request", async () => {
  mockedAxios.post.mockResolvedValue({
    data: { MediaContainer: { Metadata: [] } },
  });
  const signal = new AbortController().signal;
  await fetchDiscoverExtras(
    { guid: "plex://movie/5d776824f617c900201df022" },
    signal,
  );
  expect(mockedAxios.post.mock.calls[0][2]?.signal).toBe(signal);
});

it.each([
  {},
  { MediaContainer: { Metadata: null } },
  { MediaContainer: { Metadata: [null] } },
  { MediaContainer: { Metadata: [{ ratingKey: "extra", title: null }] } },
  { MediaContainer: { size: 2, Metadata: [] } },
])(
  "rejects invalid Discover extras instead of treating them as an empty list (%j)",
  async (data) => {
    mockedAxios.post.mockResolvedValue({ data });
    await expect(
      fetchDiscoverExtras({ guid: "plex://movie/abcdef" }),
    ).rejects.toThrow();
  },
);

it.each([42, "javascript:alert(1)", "http://cdn/trailer.m3u8"])(
  "rejects a malformed or unsafe stream URL (%j)",
  async (url) => {
    mockedAxios.post.mockResolvedValue({ data: { url } });
    await expect(resolveDiscoverExtra(extra)).rejects.toThrow();
  },
);

it("passes cancellation to stream resolution and rejects late results", async () => {
  const controller = new AbortController();
  mockedAxios.post.mockImplementationOnce(async () => {
    controller.abort();
    return { data: { url: "https://cdn/trailer.m3u8" } };
  });
  await expect(
    resolveDiscoverExtra(extra, controller.signal),
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(mockedAxios.post.mock.calls[0][2]?.signal).toBe(controller.signal);
});

it("decodes extras before returning them to Query without copying cloud fields into local metadata", async () => {
  mockedAxios.post.mockResolvedValue({
    data: {
      MediaContainer: {
        size: 1,
        Metadata: [
          {
            key: "/library/metadata/abcdef/extras/123abc",
            title: "Trailer",
            extraType: 1,
            duration: 30000,
            librarySectionID: "cloud-only",
            Media: [
              {
                id: "cloud-rendition",
                videoResolution: "1080",
                Part: [{ id: "cloud-part", key: path }],
              },
            ],
          },
        ],
      },
    },
  });
  const items = await fetchDiscoverExtras({ guid: "plex://movie/abcdef" });
  expect(items).toEqual([
    {
      key: "/library/metadata/abcdef/extras/123abc",
      title: "Trailer",
      extraType: 1,
      duration: 30000,
      Media: [{ videoResolution: "1080", Part: [{ key: path }] }],
    },
  ]);
});

it.each([
  { ratingKey: "clip", title: "Trailer", duration: -1 },
  { ratingKey: "clip", title: "Trailer", extraType: "1" },
  { ratingKey: "clip", title: "Trailer", Media: {} },
  { ratingKey: "clip", title: "Trailer", Media: [{ Part: {} }] },
  { ratingKey: "clip", title: "Trailer", Media: [{ Part: [{ key: 4 }] }] },
  { ratingKey: " ", title: "Trailer" },
  { title: "Trailer" },
])(
  "checks consumed extra fields without assuming a local PMS file shape (%j)",
  async (item) => {
    mockedAxios.post.mockResolvedValue({
      data: { MediaContainer: { Metadata: [item] } },
    });
    await expect(
      fetchDiscoverExtras({ guid: "plex://movie/abcdef" }),
    ).rejects.toThrow("invalid Discover extras");
  },
);

it("does not call Discover for titles without a cloud identity or an account token", async () => {
  await expect(fetchDiscoverExtras({})).resolves.toEqual([]);
  AuthStorage.clearActiveSession();
  await expect(
    fetchDiscoverExtras({ guid: "plex://movie/abcdef" }),
  ).resolves.toEqual([]);
  expect(mockedAxios.post).not.toHaveBeenCalled();
});
