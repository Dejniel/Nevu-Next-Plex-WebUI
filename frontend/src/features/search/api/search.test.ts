import type { Mock } from "vitest";
import { plexClient } from "features/session/model";
import { searchPlex } from "./search";

vi.mock("features/session/model", () => ({
  plexClient: { get: vi.fn() },
}));

it("encodes the query and returns Plex search results", async () => {
  const result = { Metadata: { ratingKey: "1", type: "movie" } };
  (plexClient.get as Mock).mockResolvedValue({
    MediaContainer: { SearchResult: [result] },
  });

  await expect(searchPlex("Alien & Aliens")).resolves.toEqual([result]);
  expect(plexClient.get).toHaveBeenCalledWith(
    expect.stringContaining("query=Alien+%26+Aliens"),
  );
});
