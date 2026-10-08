import { libraryBrowseViews } from "./libraryBrowseViews";

const library = (...types: string[]) =>
  ({
    Type: types.map((type) => ({
      type,
      title: type,
      key: type,
      active: false,
    })),
  }) as Plex.MediaContainer;

it.each(["movie", "show", "artist"])(
  "assigns folders a list and %s a grid without changing the native descriptors",
  (type) => {
    const data = library(type);
    const views = libraryBrowseViews(data);
    expect(views[0]).toMatchObject({
      id: type,
      presentation: "grid",
      source: "all",
    });
    expect(views[0].descriptor).toBe(data.Type![0]);
    expect(views.at(-1)).toEqual({
      id: "folders",
      title: "Folders",
      source: "folders",
      presentation: "list",
    });
    expect(data.Type).toHaveLength(1);
  },
);

it("keeps tracks in a list and album/artist/photo grids specialized by artwork", () => {
  expect(
    libraryBrowseViews(library("artist", "album", "track")).map((view) => [
      view.id,
      view.presentation,
    ]),
  ).toEqual([
    ["artist", "grid"],
    ["album", "grid"],
    ["track", "list"],
    ["folders", "list"],
  ]);
  expect(libraryBrowseViews(library("photo"))).toMatchObject([
    { id: "photo", presentation: "grid", gridLayout: "photo" },
  ]);
});

it("keeps native season sorting and filters without synthesizing unsupported types", () => {
  const data = library("show", "season", "episode");
  expect(libraryBrowseViews(data)[1].descriptor).toBe(data.Type![1]);
  expect(libraryBrowseViews(data).map((view) => view.id)).toEqual([
    "show",
    "season",
    "episode",
    "folders",
  ]);
  expect(libraryBrowseViews(library("unsupported"))).toEqual([]);
});
