import type { Mock } from "vitest";
import { authedGetStrict } from "features/session/model";
import {
  getLibrary,
  getLibraryDirectory,
  getLibrarySecondary,
} from "./libraryDirectories";

vi.mock("features/session/model", () => ({
  authedGetStrict: vi.fn(),
}));
vi.mock("shared/lib/query", () => ({
  queryBuilder: () => "query",
}));

beforeEach(() => vi.clearAllMocks());

it("loads section details and arbitrary library directories", async () => {
  (authedGetStrict as Mock)
    .mockResolvedValueOnce({ MediaContainer: { title1: "Movies" } })
    .mockResolvedValueOnce({ MediaContainer: { Metadata: [{ ratingKey: "1" }] } });

  await expect(getLibrary("1")).resolves.toMatchObject({ title1: "Movies" });
  await expect(getLibraryDirectory("/library/sections/1/all")).resolves
    .toMatchObject({ Metadata: [{ ratingKey: "1" }] });
});

it("normalizes an omitted secondary directory collection", async () => {
  (authedGetStrict as Mock).mockResolvedValue({ MediaContainer: {} });

  await expect(getLibrarySecondary("1", "genre")).resolves.toEqual([]);
});

it("normalizes an empty media directory without Metadata", async () => {
  (authedGetStrict as Mock).mockResolvedValue({ MediaContainer: { size: 0 } });

  await expect(getLibraryDirectory("/library/onDeck")).resolves.toEqual({
    size: 0,
    Metadata: [],
  });
});

it("rejects a missing container instead of treating it as an empty directory", async () => {
  (authedGetStrict as Mock).mockResolvedValue({});

  await expect(getLibraryDirectory("/library/onDeck")).rejects.toThrow(
    "Plex returned an invalid library directory",
  );
});
