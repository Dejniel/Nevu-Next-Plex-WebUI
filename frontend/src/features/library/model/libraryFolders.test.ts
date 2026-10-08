import { readFolderPath, writeFolderPath } from "./libraryFolders";

it("round-trips the parent trail including Unicode and discards unrelated properties", () => {
  const params = new URLSearchParams({ type: "folders" });
  const path = [
    { id: "8", title: "Muzyka / Łódź" },
    { id: "10", title: "First Light" },
  ];
  writeFolderPath(params, path);
  expect(readFolderPath(params.get("folderPath"))).toEqual(path);
  writeFolderPath(params, path.slice(0, -1));
  expect(readFolderPath(params.get("folderPath"))).toEqual(path.slice(0, -1));
  writeFolderPath(params, []);
  expect(params.has("folderPath")).toBe(false);
  expect(
    readFolderPath('[{"id":"8","title":"Music","token":"discard"}]'),
  ).toEqual([{ id: "8", title: "Music" }]);
});

it.each([
  null,
  "invalid",
  "{}",
  '[{"id":"../8","title":"Music"}]',
  '[{"id":"8"}]',
  '[{"id":"8","title":"A"},{"id":"8","title":"B"}]',
])("rejects malformed or cyclic folder trails: %s", (value) =>
  expect(readFolderPath(value)).toEqual([]),
);
