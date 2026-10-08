import { libraryRootQueryType, libraryResultQueryKey } from "./libraryQuery";

it("reads the hierarchical photo root without excluding albums and keeps its cache identity", () => {
  const query = { profileKey: "owner", sectionId: 5, sort: "titleSort", type: libraryRootQueryType("photo") };
  expect(query.type).toBeUndefined();
  expect(libraryResultQueryKey("server", query)[3]).toMatchObject({ sectionId: 5, type: "any" });
});

it("isolates all-photos, album children and hierarchical results with the existing query key", () => {
  const base = {
    profileKey: "owner",
    sectionId: 5,
    sort: "originallyAvailableAt:desc",
  };
  const hierarchy = libraryResultQueryKey("server", {
    ...base,
    type: libraryRootQueryType("photo"),
  });
  const photos = libraryResultQueryKey("server", {
    ...base,
    type: libraryRootQueryType("photo", true),
  });
  const children = libraryResultQueryKey("server", {
    ...base,
    source: "children",
    parentId: "60",
  });
  expect(photos[3]).toMatchObject({ type: "photo" });
  expect(photos).not.toEqual(hierarchy);
  expect(children).not.toEqual(hierarchy);
  expect(children).not.toEqual(photos);
  expect(
    libraryResultQueryKey("server", {
      ...base,
      source: "children",
      parentId: "61",
    }),
  ).not.toEqual(children);
});
