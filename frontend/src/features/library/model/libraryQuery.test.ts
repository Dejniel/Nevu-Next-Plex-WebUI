import { libraryRootQueryType, libraryResultQueryKey } from "./libraryQuery";

it("reads the hierarchical photo root without excluding albums and keeps its cache identity", () => {
  const query = { profileKey: "owner", sectionId: 5, sort: "titleSort", type: libraryRootQueryType("photo") };
  expect(query.type).toBeUndefined();
  expect(libraryResultQueryKey("server", query)[3]).toMatchObject({ sectionId: 5, type: "any" });
});
