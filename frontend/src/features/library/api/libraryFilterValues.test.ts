import * as QuickFunctions from "../../../plex/QuickFunctions";
import { getLibraryFilterValues } from "./libraryFilterValues";

afterEach(() => jest.restoreAllMocks());

const source: Plex.Filter = {
  filter: "genre",
  filterType: "string",
  key: "/library/sections/1/genre",
  title: "Genre",
  type: "filter",
};

it("extracts stable filter values from Plex fast keys", async () => {
  jest.spyOn(QuickFunctions, "authedGetStrict").mockResolvedValue({
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
  jest.spyOn(QuickFunctions, "authedGetStrict").mockRejectedValue(
    new Error("offline"),
  );

  await expect(getLibraryFilterValues(source)).rejects.toThrow("offline");
});
