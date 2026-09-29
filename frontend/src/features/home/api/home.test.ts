import { authedGetStrict } from "features/session/model";
import {
  getHomeGenres,
  getHomeLibraries,
  getHomeLibraryWindow,
  getHomeMetadata,
} from "./home";

jest.mock("features/session/model", () => ({
  authedGetStrict: jest.fn(),
  getXPlexProps: () => ({}),
}));

const request = authedGetStrict as jest.Mock;

beforeEach(() => request.mockReset());

it("loads the Plex libraries used by home discovery", async () => {
  const libraries = [{ key: "1", title: "Movies", type: "movie" }];
  request.mockResolvedValue({
    MediaContainer: { Directory: libraries },
  });

  await expect(getHomeLibraries()).resolves.toBe(libraries);
  expect(request).toHaveBeenCalledWith("/library/sections");
});

it("builds encoded genre and metadata paths", async () => {
  request.mockResolvedValue({
    MediaContainer: { Directory: [], Metadata: [] },
  });

  await getHomeGenres("one/two");
  await getHomeMetadata("item/7");

  expect(request.mock.calls[0][0]).toBe(
    "/library/sections/one%2Ftwo/genre",
  );
  expect(request.mock.calls[1][0]).toContain(
    "/library/metadata/item%2F7?",
  );
});

it("requests a bounded, consistently sorted hero window", async () => {
  request.mockResolvedValue({
    MediaContainer: { size: 8, totalSize: 100, Metadata: [] },
  });

  await getHomeLibraryWindow("4", 24, 8);

  const url = request.mock.calls[0][0];
  expect(url).toContain("/library/sections/4/all?");
  expect(url).toContain("sort=titleSort%3Aasc");
  expect(url).toContain("X-Plex-Container-Start=24");
  expect(url).toContain("X-Plex-Container-Size=8");
});

it("rejects malformed Plex responses", async () => {
  request.mockResolvedValue(null);
  await expect(getHomeLibraries()).rejects.toThrow(
    "Plex returned an invalid home response",
  );
});
