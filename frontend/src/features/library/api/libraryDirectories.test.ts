import { authedGetStrict } from "features/session/model";
import {
  getLibrary,
  getLibraryDirectory,
  getLibrarySecondary,
} from "./libraryDirectories";

jest.mock("features/session/model", () => ({
  authedGetStrict: jest.fn(),
}));
jest.mock("shared/lib/query", () => ({
  queryBuilder: () => "query",
}));

beforeEach(() => jest.clearAllMocks());

it("loads section details and arbitrary library directories", async () => {
  (authedGetStrict as jest.Mock)
    .mockResolvedValueOnce({ MediaContainer: { title1: "Movies" } })
    .mockResolvedValueOnce({ MediaContainer: { Metadata: [{ ratingKey: "1" }] } });

  await expect(getLibrary("1")).resolves.toMatchObject({ title1: "Movies" });
  await expect(getLibraryDirectory("/library/sections/1/all")).resolves
    .toMatchObject({ Metadata: [{ ratingKey: "1" }] });
});

it("normalizes an omitted secondary directory collection", async () => {
  (authedGetStrict as jest.Mock).mockResolvedValue({ MediaContainer: {} });

  await expect(getLibrarySecondary("1", "genre")).resolves.toEqual([]);
});
