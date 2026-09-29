import { AuthStorage } from "auth/AuthStorage";
import { ProxiedRequest } from "shared/api/backend";
import {
  buildSubtitleDownloadPath,
  buildSubtitleSearchPath,
  defaultSubtitleSearchTitle,
  downloadSubtitle,
  findAttachedSubtitle,
  searchSubtitles,
  SubtitleSearchResult,
} from "./subtitles";

jest.mock("shared/api/backend", () => ({ ProxiedRequest: jest.fn() }));

const request = ProxiedRequest as jest.Mock;
const result: SubtitleSearchResult = {
  id: 77,
  key: "/library/streams/77",
  streamType: 3,
  codec: "srt",
  languageCode: "pol",
  providerTitle: "OpenSubtitles",
  title: "Movie.Release.2024",
  forced: false,
  hearingImpaired: true,
};

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

it("uses the release filename as editable search text", () => {
  expect(defaultSubtitleSearchTitle("/movies/A Film (2024)/A.Film.1080p.mkv"))
    .toBe("A.Film.1080p");
  expect(defaultSubtitleSearchTitle("D:\\Movies\\A.Film.mp4"))
    .toBe("A.Film");
});

it("builds Plex subtitle search criteria", () => {
  const path = buildSubtitleSearchPath("12/3", {
    language: "pl",
    title: "A title & release",
    mediaItemID: 44,
    hearingImpaired: 3,
    forced: 1,
  });
  const url = new URL(path, "http://plex.local");

  expect(url.pathname).toBe("/library/metadata/12%2F3/subtitles");
  expect(Object.fromEntries(url.searchParams)).toEqual({
    language: "pl",
    mediaItemID: "44",
    hearingImpaired: "3",
    forced: "1",
    title: "A title & release",
  });
});

it("builds the Plex Web compatible download request", () => {
  const url = new URL(
    buildSubtitleDownloadPath("42", 44, result),
    "http://plex.local",
  );

  expect(Object.fromEntries(url.searchParams)).toEqual({
    key: "/library/streams/77",
    codec: "srt",
    language: "pol",
    hearingImpaired: "1",
    forced: "0",
    mediaItemID: "44",
    providerTitle: "OpenSubtitles",
  });
});

it("searches and downloads with the active server token", async () => {
  request
    .mockResolvedValueOnce({
      status: 200,
      data: { MediaContainer: { Stream: [result] } },
    })
    .mockResolvedValueOnce({ status: 200, data: "" });

  await expect(
    searchSubtitles("42", {
      language: "pl",
      mediaItemID: 44,
      hearingImpaired: 0,
      forced: 0,
    }),
  ).resolves.toEqual([result]);
  await downloadSubtitle("42", 44, result);

  expect(request).toHaveBeenNthCalledWith(
    1,
    expect.stringContaining("/library/metadata/42/subtitles?"),
    "GET",
    expect.objectContaining({ "X-Plex-Token": "server-token" }),
  );
  expect(request).toHaveBeenNthCalledWith(
    2,
    expect.stringContaining("/library/metadata/42/subtitles?"),
    "PUT",
    expect.objectContaining({ "X-Plex-Token": "server-token" }),
    {},
  );
});

it("finds the downloaded stream in the active media version", () => {
  const stream = {
    id: 77,
    streamType: 3,
    index: 2,
    codec: "srt",
    languageCode: "pol",
    title: "Movie.Release.2024",
  } as Plex.Stream;
  const metadata = {
    Media: [
      {
        id: 44,
        Part: [{ id: 5, Stream: [stream] } as Plex.Part],
      } as Plex.Media,
    ],
  } as Plex.Metadata;

  expect(findAttachedSubtitle(metadata, 44, result)?.stream).toBe(stream);
  expect(findAttachedSubtitle(metadata, 45, result)).toBeUndefined();
});
