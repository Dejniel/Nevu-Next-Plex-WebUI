import { AuthStorage } from "auth/AuthStorage";
import { ProxiedRequest } from "shared/api/backend";
import {
  buildSubtitleDownloadPath,
  buildSubtitleSearchPath,
  downloadSubtitle,
  searchSubtitles,
} from "./subtitles";
import type { SubtitleSearchResult } from "../model/subtitles";

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
