import type { Mock } from "vitest";
import { plexClient } from "features/session/model";
import { publishMediaChange } from "entities/media/model";
import {
  applyMetadataMatch,
  buildApplyMatchPath,
  buildMatchSearchPath,
  searchMetadataMatches,
  unmatchMetadata,
} from "./matching";

vi.mock("features/session/model", () => ({
  getActiveServerScope: () => ({ serverId: "server", profileKey: "owner" }),
  plexClient: { get: vi.fn(), put: vi.fn() },
}));
vi.mock("entities/media/model", () => ({
  publishMediaChange: vi.fn(),
}));

beforeEach(() => vi.clearAllMocks());

it("builds a manual Plex match search without empty optional fields", () => {
  expect(
    buildMatchSearchPath("12/3", {
      title: " Seven Psychopaths ",
      year: 2012,
      language: "pl-PL",
      agent: "",
    }),
  ).toBe(
    "/library/metadata/12%2F3/matches?manual=1&title=Seven+Psychopaths&year=2012&language=pl-PL",
  );
});

it("normalizes Plex SearchResult candidates", async () => {
  (plexClient.get as Mock).mockResolvedValue({
    MediaContainer: {
      SearchResult: [
        { guid: "plex://movie/1", name: "Film", year: 2024 },
        { name: "Missing guid" },
      ],
    },
  });

  await expect(
    searchMetadataMatches("42", { title: "Film" }),
  ).resolves.toEqual([
    { guid: "plex://movie/1", name: "Film", year: 2024 },
  ]);
});

it("applies the selected match and publishes its scoped effect", async () => {
  (plexClient.put as Mock).mockResolvedValue({});
  const candidate = {
    guid: "plex://movie/1",
    name: "A title & more",
    year: 2024,
  };

  await applyMetadataMatch("42", candidate);

  expect(buildApplyMatchPath("42", candidate)).toBe(
    "/library/metadata/42/match?guid=plex%3A%2F%2Fmovie%2F1&name=A+title+%26+more&year=2024",
  );
  expect(plexClient.put).toHaveBeenCalledWith(
    buildApplyMatchPath("42", candidate),
    {},
  );
  expect(publishMediaChange).toHaveBeenCalledWith({ serverId: "server", profileKey: "owner", kind: "item", effect: "unknown", id: "42" });
});

it("unmatches an item and publishes its scoped effect", async () => {
  (plexClient.put as Mock).mockResolvedValue({});

  await unmatchMetadata("12/3");

  expect(plexClient.put).toHaveBeenCalledWith(
    "/library/metadata/12%2F3/unmatch",
    {},
  );
  expect(publishMediaChange).toHaveBeenCalledWith({ serverId: "server", profileKey: "owner", kind: "item", effect: "unknown", id: "12/3" });
});
