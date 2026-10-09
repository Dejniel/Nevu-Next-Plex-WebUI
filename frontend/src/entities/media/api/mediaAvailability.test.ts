import type { MediaMetadata } from "plex/media";
import type { Mock } from "vitest";
import { AuthStorage } from "features/session/model";
import { ProxiedRequest } from "shared/api/backend";
import { getLocalMediaMatches } from "./mediaAvailability";

vi.mock("shared/api/backend", () => ({ ProxiedRequest: vi.fn() }));
const transport = ProxiedRequest as Mock;
const movie = (
  ratingKey: string,
  guid = "plex://movie/one",
  librarySectionID = 1,
): MediaMetadata => ({
  ratingKey,
  guid,
  librarySectionID,
  type: "movie",
  title: "Movie",
});
const response = (items: unknown[], totalSize?: number) => ({
  status: 200,
  data: { MediaContainer: { Metadata: items, totalSize } },
});

beforeEach(() => {
  vi.resetAllMocks();
  AuthStorage.saveActiveSession({
    profile: null,
    accountToken: "account",
    serverToken: "server",
  });
});

it("returns every local copy and discards remote and unrelated matches", async () => {
  transport.mockResolvedValue(
    response([
      movie("1"),
      movie("2", "plex://movie/one", 2),
      movie("remote"),
      movie("3", "plex://movie/other"),
      movie("4", "plex://movie/one", 0),
    ]),
  );
  await expect(
    getLocalMediaMatches(["plex://movie/one", "plex://movie/one"]),
  ).resolves.toEqual([movie("1"), movie("2", "plex://movie/one", 2)]);
  const params = new URLSearchParams(transport.mock.calls[0][0].split("?")[1]);
  expect(params.get("guid")).toBe("plex://movie/one");
  expect(params.get("includeExternalMedia")).toBe("0");
});

it("batches a large list instead of issuing a request per title", async () => {
  transport.mockResolvedValue(response([]));
  const guids = Array.from(
    { length: 121 },
    (_, index) => `plex://movie/${index}`,
  );
  await expect(getLocalMediaMatches(guids)).resolves.toEqual([]);
  expect(transport).toHaveBeenCalledTimes(3);
  const requested = transport.mock.calls.flatMap(([url]) =>
    new URLSearchParams(url.split("?")[1]).get("guid")!.split(","),
  );
  expect(requested).toEqual(guids);
});

it("loads all copies across multiple pages", async () => {
  const first = Array.from({ length: 200 }, (_, index) =>
    movie(String(index + 1)),
  );
  transport
    .mockResolvedValueOnce(response(first, 201))
    .mockResolvedValueOnce(response([movie("201")], 201));
  await expect(
    getLocalMediaMatches(["plex://movie/one"]),
  ).resolves.toHaveLength(201);
  expect(transport.mock.calls[1][0]).toContain("X-Plex-Container-Start=200");
});

it("stops repeated pages and surfaces Plex request errors", async () => {
  const page = Array.from({ length: 200 }, (_, index) =>
    movie(String(index + 1)),
  );
  transport.mockResolvedValue(response(page, 401));
  await expect(getLocalMediaMatches(["plex://movie/one"])).rejects.toThrow(
    "incomplete",
  );
  expect(transport).toHaveBeenCalledTimes(2);
  transport.mockResolvedValue({ status: 401, data: {} });
  await expect(getLocalMediaMatches(["plex://movie/one"])).rejects.toThrow(
    "401",
  );
});

it("does not start requests for an aborted lookup", async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(
    getLocalMediaMatches(["plex://movie/one"], controller.signal),
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(transport).not.toHaveBeenCalled();
});

it("does not treat a repeated final page as a complete list of local copies", async () => {
  const page = Array.from({ length: 200 }, (_, index) =>
    movie(String(index + 1)),
  );
  transport.mockResolvedValue(response(page, 201));
  await expect(getLocalMediaMatches(["plex://movie/one"])).rejects.toThrow(
    "incomplete",
  );
  expect(transport).toHaveBeenCalledTimes(2);
});

it("deduplicates overlapping server rows without merging editions sharing a GUID", async () => {
  const first = Array.from({ length: 200 }, (_, index) =>
    movie(String(index + 1)),
  );
  transport
    .mockResolvedValueOnce(response(first, 202))
    .mockResolvedValueOnce(
      response([first[199], movie("201", "plex://movie/one", 2)], 202),
    );
  const matches = await getLocalMediaMatches(["plex://movie/one"]);
  expect(matches).toHaveLength(201);
  expect(matches.at(-1)).toEqual(movie("201", "plex://movie/one", 2));
});

it.each([
  { title: undefined },
  { type: undefined },
  { ratingKey: 1 },
  { librarySectionID: "1" },
  { librarySectionID: -1 },
  { guid: 1 },
  { Media: {} },
])("rejects malformed local match rows: %j", async (invalid) => {
  transport.mockResolvedValue(response([{ ...movie("1"), ...invalid }]));
  await expect(getLocalMediaMatches(["plex://movie/one"])).rejects.toThrow(
    "invalid",
  );
});

it("does not mistake an unsupported or mismatched identity for a local copy", async () => {
  transport.mockResolvedValue(
    response([
      movie("1", "plex://show/one"),
      movie("2", "com.plexapp.agents.none://local"),
      movie("3", "plex://movie/one", 0),
      { ...movie("4"), librarySectionID: undefined },
    ]),
  );
  await expect(getLocalMediaMatches(["plex://movie/one"])).resolves.toEqual([]);
});

it("keeps the captured server token across pages", async () => {
  transport
    .mockImplementationOnce(async () => {
      AuthStorage.saveActiveSession({
        profile: null,
        accountToken: "next-account",
        serverToken: "next-server",
      });
      return response([movie("1")], 2);
    })
    .mockResolvedValueOnce(response([movie("2")], 2));
  await expect(
    getLocalMediaMatches(["plex://movie/one"]),
  ).resolves.toHaveLength(2);
  expect(transport).toHaveBeenNthCalledWith(
    2,
    expect.any(String),
    "GET",
    expect.objectContaining({ "X-Plex-Token": "server" }),
    undefined,
    undefined,
  );
});

it("rejects invalid requested GUIDs before issuing any batches", async () => {
  await expect(
    getLocalMediaMatches(["plex://movie/one", "invalid"]),
  ).rejects.toThrow("identifiers");
  expect(transport).not.toHaveBeenCalled();
  AuthStorage.clearActiveSession();
  await expect(getLocalMediaMatches([])).resolves.toEqual([]);
});
