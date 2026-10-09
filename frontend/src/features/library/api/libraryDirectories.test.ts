import type { Mock } from "vitest";
import { plexClient } from "features/session/model";
import { getLibraryDirectory } from "./libraryDirectories";

vi.mock("features/session/model", () => ({
  plexClient: { get: vi.fn() },
}));

it("preserves a filter source's existing query string and forwards cancellation", async () => {
  vi.mocked(plexClient.get).mockResolvedValue({ MediaContainer: { size: 0 } });
  const controller = new AbortController();
  await getLibraryDirectory("/library/sections/1/genre?type=1", undefined, controller.signal);
  const [url, signal] = vi.mocked(plexClient.get).mock.calls.at(-1)!;
  expect(new URL(url, window.location.origin).searchParams.get("type")).toBe("1");
  expect(signal).toBe(controller.signal);
});

beforeEach(() => vi.clearAllMocks());

it("loads arbitrary library directories", async () => {
  (plexClient.get as Mock).mockResolvedValueOnce({
    MediaContainer: { Metadata: [{ ratingKey: "1" }] },
  });

  await expect(getLibraryDirectory("/library/sections/1/all")).resolves.toMatchObject({
    Metadata: [{ ratingKey: "1" }],
  });
});

it("normalizes an empty media directory without Metadata", async () => {
  (plexClient.get as Mock).mockResolvedValue({ MediaContainer: { size: 0 } });

  await expect(getLibraryDirectory("/library/onDeck")).resolves.toEqual({
    size: 0,
    Metadata: [],
  });
});

it("rejects a missing container instead of treating it as an empty directory", async () => {
  (plexClient.get as Mock).mockResolvedValue({});

  await expect(getLibraryDirectory("/library/onDeck")).rejects.toThrow(
    "Plex returned an invalid library directory",
  );
});

it("preserves bounded discovery window parameters and forwards cancellation", async () => {
  vi.mocked(plexClient.get).mockResolvedValue({ MediaContainer: { size: 8, Metadata: [] } });
  const signal = new AbortController().signal;
  await getLibraryDirectory(
    "/library/sections/4/all",
    {
      sort: "titleSort:asc",
      "X-Plex-Container-Start": 24,
      "X-Plex-Container-Size": 8,
    },
    signal,
  );
  const [url, requestSignal] = vi.mocked(plexClient.get).mock.calls[0];
  const params = new URL(url, "http://plex").searchParams;
  expect(params.get("sort")).toBe("titleSort:asc");
  expect(params.get("X-Plex-Container-Start")).toBe("24");
  expect(params.get("X-Plex-Container-Size")).toBe("8");
  expect(requestSignal).toBe(signal);
});
