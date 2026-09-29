import { plexClient } from "features/session/model";
import { searchPlex } from "./search";

jest.mock("features/session/model", () => ({
  plexClient: { get: jest.fn() },
}));

it("encodes the query and returns Plex search results", async () => {
  const result = { Metadata: { ratingKey: "1", type: "movie" } };
  (plexClient.get as jest.Mock).mockResolvedValue({
    MediaContainer: { SearchResult: [result] },
  });

  await expect(searchPlex("Alien & Aliens")).resolves.toEqual([result]);
  expect(plexClient.get).toHaveBeenCalledWith(
    expect.stringContaining("query=Alien+%26+Aliens"),
  );
});
