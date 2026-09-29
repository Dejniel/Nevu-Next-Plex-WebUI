import { plexClient } from "features/session/model";
import { invalidateLibraryCache } from "shared/lib/libraryCache";
import {
  applyMetadataMatch,
  buildApplyMatchPath,
  buildMatchSearchPath,
  searchMetadataMatches,
  unmatchMetadata,
} from "./matching";

jest.mock("features/session/model", () => ({
  plexClient: { get: jest.fn(), put: jest.fn() },
}));
jest.mock("shared/lib/libraryCache", () => ({
  invalidateLibraryCache: jest.fn(),
}));

beforeEach(() => jest.clearAllMocks());

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
  (plexClient.get as jest.Mock).mockResolvedValue({
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

it("applies the selected match and invalidates cached library pages", async () => {
  (plexClient.put as jest.Mock).mockResolvedValue({});
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
  expect(invalidateLibraryCache).toHaveBeenCalledTimes(1);
});

it("unmatches an item and invalidates cached library pages", async () => {
  (plexClient.put as jest.Mock).mockResolvedValue({});

  await unmatchMetadata("12/3");

  expect(plexClient.put).toHaveBeenCalledWith(
    "/library/metadata/12%2F3/unmatch",
    {},
  );
  expect(invalidateLibraryCache).toHaveBeenCalledTimes(1);
});
