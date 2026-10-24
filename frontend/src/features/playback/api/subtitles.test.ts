import type { Mock } from "vitest";
import { AuthStorage } from "features/session/model";
import { ProxiedRequest } from "shared/api/backend";
import {
  buildSubtitleDownloadPath,
  buildSubtitleSearchPath,
  downloadSubtitle,
  searchSubtitles,
} from "./subtitles";
import type { SubtitleSearchResult } from "../model/subtitles";

vi.mock("shared/api/backend", () => ({ ProxiedRequest: vi.fn() }));

const request = ProxiedRequest as Mock;
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
  vi.clearAllMocks();
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
    transient: "0",
    mediaItemID: "44",
    hearingImpaired: "1",
    forced: "0",
    codec: "srt",
    language: "pol",
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
    undefined,
    undefined,
  );
  expect(request).toHaveBeenNthCalledWith(
    2,
    expect.stringContaining("/library/metadata/42/subtitles?"),
    "PUT",
    expect.objectContaining({ "X-Plex-Token": "server-token" }),
    undefined,
    undefined,
  );
});

it("passes cancellation to subtitle search and download", async () => {
  request.mockResolvedValue({ status: 200, data: { MediaContainer: {} } });
  const signal = new AbortController().signal;
  await searchSubtitles(
    "42",
    { language: "pl", mediaItemID: 44, hearingImpaired: 0, forced: 0 },
    signal,
  );
  await downloadSubtitle("42", 44, result, signal);
  expect(request.mock.calls.map((args) => args[4])).toEqual([signal, signal]);
});

it("keeps subtitle permission errors readable and preserves their cause", async () => {
  request.mockResolvedValue({ status: 403, data: "denied" });
  await expect(
    searchSubtitles("42", {
      language: "pl",
      mediaItemID: 44,
      hearingImpaired: 0,
      forced: 0,
    }),
  ).rejects.toMatchObject({
    message: "This Plex profile cannot search for subtitles.",
    status: 403,
    cause: { status: 403, response: "denied" },
  });
});

it("does not convert subtitle cancellation into a search error", async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(
    searchSubtitles(
      "42",
      { language: "pl", mediaItemID: 44, hearingImpaired: 0, forced: 0 },
      controller.signal,
    ),
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(request).not.toHaveBeenCalled();
});

it.each([
  {},
  { MediaContainer: "invalid" },
  { MediaContainer: [] },
  { MediaContainer: { Stream: null } },
  { MediaContainer: { Stream: {} } },
])("rejects malformed subtitle search results (%j)", async (data) => {
  request.mockResolvedValue({ status: 200, data });
  await expect(
    searchSubtitles("42", {
      language: "pl",
      mediaItemID: 44,
      hearingImpaired: 0,
      forced: 0,
    }),
  ).rejects.toThrow("invalid subtitle search results");
});

it("preserves provider identity and normalizes native flags without assuming optional ids", async () => {
  const row = {
    ...result,
    id: undefined,
    sourceKey: "provider://release?language=pol",
    hearingImpaired: 1,
    forced: 0,
    downloaded: 0,
    perfectMatch: 1,
  };
  request.mockResolvedValue({
    status: 200,
    data: { MediaContainer: { Stream: [row] } },
  });
  const [subtitle] = await searchSubtitles("42", {
    language: "pl",
    mediaItemID: 44,
    forced: 0,
    hearingImpaired: 0,
  });
  expect(subtitle).toMatchObject({
    sourceKey: row.sourceKey,
    hearingImpaired: true,
    forced: false,
    downloaded: false,
    perfectMatch: true,
  });
  expect(subtitle.id).toBeUndefined();
});
it.each([
  { key: undefined },
  { key: "" },
  { sourceKey: 42 },
  { codec: 3 },
  { streamType: 2 },
  { forced: "false" },
])("rejects malformed subtitle rows %j", async (invalid) => {
  request.mockResolvedValue({
    status: 200,
    data: { MediaContainer: { Stream: [{ ...result, ...invalid }] } },
  });
  await expect(
    searchSubtitles("42", {
      language: "pl",
      mediaItemID: 44,
      forced: 0,
      hearingImpaired: 0,
    }),
  ).rejects.toThrow("invalid");
});
