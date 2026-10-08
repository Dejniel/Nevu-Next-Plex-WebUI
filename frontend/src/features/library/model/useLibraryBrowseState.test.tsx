import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { useActiveServerScope } from "features/session/model";
import { useLibraryBrowseState } from "./useLibraryBrowseState";

vi.mock("features/session/model", () => ({ useActiveServerScope: vi.fn() }));
const nameSort = "photo.titleSort,photo.originallyAvailableAt,photo.id";
const photoLibrary = {
  Type: [
    {
      type: "photo",
      key: "/all?type=13",
      title: "Photos",
      active: true,
      Field: [
        { key: "title", type: "string", title: "Title" },
        { key: "originallyAvailableAt", type: "date", title: "Date Taken" },
      ],
      Sort: [
        {
          key: "addedAt",
          descKey: "addedAt:desc",
          title: "Date Added",
          defaultDirection: "desc",
        },
        {
          key: "originallyAvailableAt",
          descKey: "originallyAvailableAt:desc",
          title: "Date Taken",
          defaultDirection: "desc",
        },
        {
          key: nameSort,
          descKey: "photo.titleSort:desc,photo.originallyAvailableAt,photo.id",
          title: "Name",
          default: "asc",
          defaultDirection: "asc",
        },
        { key: "random", descKey: "random:desc", title: "Random" },
      ],
    },
  ],
  FieldType: [
    {
      type: "string",
      Operator: [
        { key: "=", title: "contains" },
        { key: "==", title: "is" },
      ],
    },
    {
      type: "date",
      Operator: [
        { key: ">>=", title: "after" },
        { key: "<<=", title: "before" },
      ],
    },
  ],
} as Plex.MediaContainer;
let root: Root;
let latest: ReturnType<typeof useLibraryBrowseState>;
let location: ReturnType<typeof useLocation>;
let navigate: ReturnType<typeof useNavigate>;
function Harness({
  library = photoLibrary,
  parentId,
  allPhotos = false,
}: {
  library?: Plex.MediaContainer;
  parentId?: string;
  allPhotos?: boolean;
}) {
  latest = useLibraryBrowseState("5", library, { parentId, allPhotos });
  location = useLocation();
  navigate = useNavigate();
  return null;
}
const render = async (
  element: React.ReactNode,
  search = "",
  state?: unknown,
) => {
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={[{ pathname: "/browse/5", search, state }]}>
        {element}
      </MemoryRouter>,
    ),
  );
};
beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  sessionStorage.clear();
  vi.mocked(useActiveServerScope).mockReturnValue({
    serverId: "server",
    profileKey: "owner",
  });
  root = createRoot(document.createElement("div"));
});
afterEach(async () => {
  await act(async () => root.unmount());
});

it("selects photo-only chronological browsing separately from the hierarchical root", async () => {
  await render(<Harness />);
  expect(latest.query).toMatchObject({
    sectionId: 5,
    sort: "originallyAvailableAt:desc",
  });
  expect(latest.query?.type).toBeUndefined();
  await render(<Harness allPhotos />);
  expect(latest.query).toMatchObject({
    type: "photo",
    sort: "originallyAvailableAt:desc",
  });
  expect(new URLSearchParams(location.search).get("type")).toBe("photo");
});

it("separates folder navigation from media types and preserves its parent trail in history", async () => {
  const library = { ...photoLibrary, Type: [{ type: "artist", key: "artist", title: "Artists", active: true }, { type: "track", key: "track", title: "Tracks", active: false }] } as Plex.MediaContainer;
  await render(<Harness library={library} />);
  await act(async () => latest.setView("folders"));
  expect(latest.activeView).toMatchObject({ id: "folders", presentation: "list" });
  expect(latest.activeItemType).toBeUndefined();
  expect(latest.query).toEqual({ profileKey: "owner", sectionId: 5, source: "folders", sort: "titleSort" });
  await act(async () => latest.setFolderPath([{ id: "8", title: "Artist" }, { id: "10", title: "Album" }]));
  expect(latest.query?.folderId).toBe("10");
  expect(latest.folderPath.map(folder => folder.title)).toEqual(["Artist", "Album"]);
  await act(async () => latest.setFolderPath(latest.folderPath.slice(0, -1)));
  expect(latest.query?.folderId).toBe("8");
  await act(async () => navigate(-1));
  expect(latest.query?.folderId).toBe("10");
  await act(async () => latest.setView("track"));
  expect(latest.activeView?.presentation).toBe("list");
  expect(latest.query).toMatchObject({ type: "track" });
  expect(latest.query?.folderId).toBeUndefined();
  expect(new URLSearchParams(location.search).has("folderPath")).toBe(false);
});

it("uses the native album default, retains mixed children and rejects random sorting", async () => {
  localStorage.setItem("librarySort:5:photo", "addedAt:desc");
  localStorage.setItem("librarySort:5:photo:photos", "originallyAvailableAt");
  localStorage.setItem("typeFilter:5", "unrelated-root-preference");
  await render(<Harness parentId="61" />, "?sort=random:desc");
  expect(latest.query).toEqual({
    profileKey: "owner",
    sectionId: 5,
    source: "children",
    parentId: "61",
    sort: nameSort,
  });
  expect(latest.sortOptions.some((option) => option.random)).toBe(false);
  expect(new URLSearchParams(location.search).get("sort")).toBe(nameSort);
  expect(localStorage.getItem("typeFilter:5")).toBe(
    "unrelated-root-preference",
  );
  expect(localStorage.getItem("librarySort:5:photo")).toBe("addedAt:desc");
  expect(localStorage.getItem("librarySort:5:photo:photos")).toBe(
    "originallyAvailableAt",
  );
});

it("scopes canonical filters to the current album and leaves preview history intact", async () => {
  const filters = [
    ["title", "=", "Sea"],
    ["originallyAvailableAt", ">>=", "2026-08-01"],
    ["genre", "=", "invalid-for-photos"],
    ["title", "!=", "undeclared-operator"],
  ];
  const params = new URLSearchParams({
    match: "any",
    photo: "62",
    photoIndex: "0",
    sort: "addedAt:desc",
  });
  filters.forEach((filter) => params.append("filter", JSON.stringify(filter)));
  await render(<Harness parentId="61" />, `?${params}`, { photoPreview: true });
  expect(latest.activeFilters).toHaveLength(2);
  expect(latest.query?.filterExpression).toEqual({
    kind: "group",
    mode: "or",
    children: [
      {
        kind: "clause",
        field: "originallyAvailableAt",
        operator: ">>=",
        value: "2026-08-01",
      },
      { kind: "clause", field: "title", operator: "=", value: "Sea" },
    ],
  });
  expect(new URLSearchParams(location.search).getAll("filter")).toHaveLength(2);
  expect(new URLSearchParams(location.search).get("photo")).toBe("62");
  expect(location.state).toEqual({ photoPreview: true });
});

it("removes the preview cursor when editing the result and keeps one shared album sort preference", async () => {
  await render(<Harness parentId="61" />, "?photo=62&photoIndex=0", {
    catalogNavigation: true,
  });
  await act(async () => latest.setSort("addedAt:desc"));
  expect(new URLSearchParams(location.search).has("photo")).toBe(false);
  expect(new URLSearchParams(location.search).has("photoIndex")).toBe(false);
  expect(location.state).toEqual({ catalogNavigation: true });
  await act(async () =>
    latest.updateFilters(
      [{ field: "title", operator: "=", value: "Sea" }],
      "or",
    ),
  );
  expect(latest.query?.filterExpression).toMatchObject({
    field: "title",
    value: "Sea",
  });
  expect(new URLSearchParams(location.search).get("match")).toBe("any");
  await render(<Harness parentId="66" />);
  expect(latest.query).toMatchObject({
    source: "children",
    parentId: "66",
    sort: "addedAt:desc",
  });
  await act(async () => latest.updateFilters([]));
  expect(latest.query?.filterExpression).toBeUndefined();
  expect(new URLSearchParams(location.search).has("match")).toBe(false);
  expect(localStorage.getItem("librarySort:5:photo:children")).toBe(
    "addedAt:desc",
  );
});

it("captures profile changes and preserves stable random browsing for root libraries", async () => {
  await render(<Harness allPhotos />, "?sort=random:desc");
  const seed = latest.query?.seed;
  expect(seed).toBeTruthy();
  await act(async () =>
    latest.updateFilters([{ field: "title", operator: "=", value: "Sea" }]),
  );
  expect(latest.query?.seed).toBe(seed);
  await act(async () => latest.reshuffle());
  expect(latest.query?.seed).not.toBe(seed);
  vi.mocked(useActiveServerScope).mockReturnValue({
    serverId: "server",
    profileKey: "guest",
  });
  await render(<Harness allPhotos />);
  expect(latest.query).toMatchObject({ profileKey: "guest", type: "photo" });
  expect(latest.query?.seed).not.toBe(seed);
});

it("returns from an album to its container after sorting and filtering", async () => {
  await act(async () =>
    root.render(
      <MemoryRouter
        initialEntries={["/browse/5?view=browse", "/browse/5/item/61"]}
        initialIndex={1}
      >
        <Harness parentId="61" />
      </MemoryRouter>,
    ),
  );
  await act(async () => latest.setSort("addedAt:desc"));
  await act(async () =>
    latest.updateFilters([{ field: "title", operator: "=", value: "Sea" }]),
  );
  await act(async () => navigate(-1));
  expect(location.pathname).toBe("/browse/5");
});

it("continues to use declared video types and their existing preferences", async () => {
  const library = {
    Type: [
      { type: "show", key: "/all?type=2", title: "Shows", active: true },
      {
        type: "episode",
        key: "/all?type=4",
        title: "Episodes",
        Sort: [
          {
            key: "addedAt",
            descKey: "addedAt:desc",
            title: "Date Added",
            default: "desc",
          },
        ],
      },
    ],
  } as Plex.MediaContainer;
  localStorage.setItem("typeFilter:5", "episode");
  localStorage.setItem("sortBy", "addedAt");
  await render(<Harness library={library} />);
  expect(latest.query).toMatchObject({ type: "episode", sort: "addedAt" });
  expect(latest.video).toBe(true);
  await act(async () => latest.setView("show"));
  expect(latest.query).toMatchObject({ type: "show", sort: "titleSort" });
  expect(localStorage.getItem("typeFilter:5")).toBe("show");
});
