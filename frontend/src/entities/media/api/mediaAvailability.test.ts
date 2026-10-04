import { AuthStorage } from "features/session/model";
import { ProxiedRequest } from "shared/api/backend";
import { getLocalMediaMatches } from "./mediaAvailability";

jest.mock("shared/api/backend", () => ({ ProxiedRequest: jest.fn() }));
const transport = ProxiedRequest as jest.Mock;
const movie = (
  ratingKey: string,
  guid = "plex://movie/one",
  librarySectionID = 1,
) => ({ ratingKey, guid, librarySectionID }) as Plex.Metadata;
const response = (items: Plex.Metadata[], totalSize?: number) => ({
  status: 200,
  data: { MediaContainer: { Metadata: items, totalSize } },
});

beforeEach(() => {
  jest.resetAllMocks();
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
  ).resolves.toEqual([]);
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
