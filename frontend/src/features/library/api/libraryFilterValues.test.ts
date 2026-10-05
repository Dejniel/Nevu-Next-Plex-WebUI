import type { Mock } from "vitest";
import { authedGetStrict } from "features/session/model";
import { getLibraryFilterValues } from "./libraryFilterValues";

vi.mock("features/session/model", () => ({
  authedGetStrict: vi.fn(),
}));

const request = authedGetStrict as Mock;

beforeEach(() => {
  request.mockReset();
});

const source: Plex.Filter = {
  filter: "genre",
  filterType: "string",
  key: "/library/sections/1/genre",
  title: "Genre",
  type: "filter",
};

it("extracts stable filter values from Plex fast keys", async () => {
  request.mockResolvedValue({
    MediaContainer: {
      Directory: [{
        key: "fallback",
        title: "Action",
        fastKey: "/library/sections/1/all?genre=393",
      }],
    },
  });

  await expect(getLibraryFilterValues(source)).resolves.toEqual([
    { value: "393", label: "Action" },
  ]);
});

it("propagates Plex failures while loading filter values", async () => {
  request.mockRejectedValue(
    new Error("offline"),
  );

  await expect(getLibraryFilterValues(source)).rejects.toThrow("offline");
});
