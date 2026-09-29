import { plexClient } from "plex/QuickFunctions";
import { getLibraries } from "./libraries";

jest.mock("plex/QuickFunctions", () => ({
  plexClient: { get: jest.fn() },
}));

it("loads the available Plex library sections", async () => {
  (plexClient.get as jest.Mock).mockResolvedValue({
    MediaContainer: { Directory: [{ key: "1", title: "Movies" }] },
  });

  await expect(getLibraries()).resolves.toEqual([
    { key: "1", title: "Movies" },
  ]);
  expect(plexClient.get).toHaveBeenCalledWith("/library/sections");
});

it("returns an empty list when Plex omits the directory collection", async () => {
  (plexClient.get as jest.Mock).mockResolvedValue({ MediaContainer: {} });

  await expect(getLibraries()).resolves.toEqual([]);
});
