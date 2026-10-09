import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  getMediaMetadata,
  mediaMetadataQueryKey,
  type MediaItemData,
} from "entities/media/model";
import {
  AuthStorage,
  useAuthSession,
  useServerSession,
} from "features/session/model";
import { serverQueryClient as client } from "shared/api/queryClient";
import { setMediaRating } from "../api/rating";
import { MediaItemMenu } from "./MediaItemMenu";
import { MetadataDialogHost } from "./MetadataDialogHost";
import { useMetadataDialog } from "../model/metadataDialog";
import { openMediaListDialog } from "features/media-lists/public";
import { ProxiedRequest } from "shared/api/backend";

vi.mock("shared/api/backend", async original => ({
  ...(await original<typeof import("shared/api/backend")>()),
  ProxiedRequest: vi.fn(),
}));

vi.mock("entities/media/api/media", async (original) => ({
  ...(await original<typeof import("entities/media/api/media")>()),
  getMediaMetadata: vi.fn(),
}));
vi.mock("features/media-lists/public", async (original) => ({
  ...(await original<typeof import("features/media-lists/public")>()),
  openMediaListDialog: vi.fn(),
}));
vi.mock("../api/rating", () => ({ setMediaRating: vi.fn() }));
const item = { ratingKey: "42", type: "track", title: "Song" } as MediaItemData;
const metadata = (type = "track") =>
  ({
    ...item,
    librarySectionID: 3,
    type,
    userRating: 8,
    Media: [
      {
        id: 1,
        container: "flac",
        Part: [
          {
            id: 1,
            key: "/library/parts/1/file.flac",
            file: "/Music/song.flac",
            size: 1024,
          },
        ],
      },
      {
        id: 2,
        container: "mp3",
        Part: [
          {
            id: 2,
            key: "/library/parts/2/file.mp3",
            file: "/Music/song.mp3",
            size: 2048,
          },
        ],
      },
    ],
  }) as Plex.Metadata;
let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  useMetadataDialog.setState({ selection: null });
  client.clear();
  localStorage.clear();
  sessionStorage.clear();
  AuthStorage.saveActiveSession({
    profile: null,
    accountToken: "account",
    serverToken: "active-token",
  });
  useAuthSession.setState({
    status: "ready",
    revision: 1,
    ownerUser: { id: 1 } as Plex.UserData,
    activeUser: { id: 1, restricted: false } as Plex.UserData,
    activeProfile: {
      id: 1,
      title: "Owner",
      isOwner: true,
      protected: false,
      restricted: false,
    },
  });
  useServerSession.setState({
    canManageServer: false,
    server: {
      machineIdentifier: "server",
      allowSync: true,
    } as Plex.ServerPreferences,
  });
  vi.mocked(getMediaMetadata).mockResolvedValue(metadata());
  vi.mocked(setMediaRating).mockResolvedValue(true);
  vi.mocked(ProxiedRequest).mockResolvedValue({ status: 200, data: { MediaContainer: {} } });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  client.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  Reflect.deleteProperty(document, "fullscreenElement");
});
const settle = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 15));
  });
};
const render = async (value = item) => {
  await act(async () => root.render(<><MediaItemMenu item={value} /><MetadataDialogHost /></>));
};
const click = async (element: Element | null | undefined) => {
  expect(element).toBeTruthy();
  await act(async () => (element as HTMLElement).click());
  await settle();
};
const menuItem = (text: string) =>
  Array.from(document.querySelectorAll('[role="menuitem"]')).find((element) =>
    element.textContent?.startsWith(text),
  );
const downloads = () =>
  Array.from(document.querySelectorAll<HTMLAnchorElement>("a[download]"));

it.each(["artist", "album", "track", "photo", "photoalbum"])(
  "opens the shared metadata editor from the %s menu only for server managers",
  async type => {
    vi.mocked(getMediaMetadata).mockResolvedValue(metadata(type));
    await render({ ...item, type } as MediaItemData);
    await click(host.querySelector("button"));
    expect(menuItem("Edit metadata")).toBeUndefined();
    await click(document.body);
    await act(async () => useServerSession.setState({ canManageServer: true }));
    await click(host.querySelector("button"));
    await click(menuItem("Edit metadata"));
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Edit metadata");
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain(["photo", "photoalbum"].includes(type) ? "Thumbnail" : "Cover");
  },
);

it("loads metadata only when opened, keeps every original file and reuses the canonical query", async () => {
  await render();
  expect(getMediaMetadata).not.toHaveBeenCalled();
  await click(host.querySelector("button"));
  expect(getMediaMetadata).toHaveBeenCalledTimes(1);
  expect(downloads().map((link) => link.download)).toEqual([
    "song.flac",
    "song.mp3",
  ]);
  expect(
    downloads().map((link) => new URL(link.href).searchParams.get("download")),
  ).toEqual(["1", "1"]);
  expect(
    downloads().every(
      (link) =>
        new URL(link.href).searchParams.get("X-Plex-Token") === "active-token",
    ),
  ).toBe(true);
  await click(menuItem("Rate"));
  expect(document.querySelector('[aria-label="Clear rating"]')).toBeTruthy();
  await click(document.querySelector('[aria-label="Clear rating"]'));
  await click(host.querySelector("button"));
  expect(getMediaMetadata).toHaveBeenCalledTimes(1);
});

it.each(["track", "photo"])(
  "saves or clears the %s rating in the existing metadata cache after acknowledgement",
  async (type) => {
    const data = metadata(type);
    vi.mocked(getMediaMetadata).mockResolvedValue(data);
    await render({ ...item, type } as MediaItemData);
    await click(host.querySelector("button"));
    await click(menuItem("Rate"));
    await click(document.querySelector('[aria-label="Clear rating"]'));
    expect(setMediaRating).toHaveBeenCalledWith(
      -1,
      "42",
      expect.any(AbortSignal),
    );
    expect(
      client.getQueryData<Plex.Metadata>(
        mediaMetadataQueryKey({ serverId: "server", profileKey: "1:1" }, "42"),
      )?.userRating,
    ).toBeUndefined();
    expect(
      document.querySelector<HTMLButtonElement>('[aria-label="Clear rating"]')!
        .disabled,
    ).toBe(true);
    expect(data.userRating).toBe(8);
  },
);

it("leaves ratings available while withholding all original files without download permission", async () => {
  useServerSession.setState({
    server: {
      machineIdentifier: "server",
      allowSync: false,
    } as Plex.ServerPreferences,
  });
  await render();
  await click(host.querySelector("button"));
  expect(menuItem("Rate")).toBeTruthy();
  expect(downloads()).toEqual([]);
});

it("offers metadata retry instead of silently dropping failed downloads", async () => {
  vi.mocked(getMediaMetadata).mockRejectedValueOnce(new Error("offline"));
  await render();
  await click(host.querySelector("button"));
  expect(menuItem("Rate")?.getAttribute("aria-disabled")).toBe("true");
  expect(downloads()).toEqual([]);
  await click(menuItem("Retry media details"));
  expect(downloads()).toHaveLength(2);
  expect(getMediaMetadata).toHaveBeenCalledTimes(2);
});

it.each(["item", "profile"])(
  "closes old actions and discards their file links after a %s change",
  async (change) => {
    await render();
    await click(host.querySelector("button"));
    expect(downloads()).toHaveLength(2);
    await act(async () => {
      if (change === "profile")
        useAuthSession.setState({
          revision: 2,
          activeProfile: {
            id: 2,
            title: "Guest",
            isOwner: false,
            protected: false,
            restricted: false,
          },
        });
      else root.render(<MediaItemMenu item={{ ...item, ratingKey: "43" }} />);
    });
    expect(host.querySelector("button")?.getAttribute("aria-expanded")).toBe(
      "false",
    );
    expect(downloads()).toEqual([]);
  },
);

it("keeps menus and rating controls inside the fullscreen overlay host", async () => {
  Object.defineProperty(document, "fullscreenElement", {
    configurable: true,
    value: host,
  });
  await render();
  await click(host.querySelector("button"));
  expect(host.querySelector(".MuiMenu-root")).toBeTruthy();
  await click(menuItem("Rate"));
  expect(host.querySelector(".MuiPopover-root")).toBeTruthy();
});

it("opens the shared photo-album action from the personal photo menu", async () => {
  const photo = { ...item, type: "photo" as const, title: "Photo" };
  await act(async () => root.render(<MediaItemMenu item={photo} />));
  await act(async () => (host.querySelector("button") as HTMLElement).click());
  const action = Array.from(
    document.querySelectorAll('[role="menuitem"]'),
  ).find((element) => element.textContent === "Add to album…");
  expect(action).toBeDefined();
  await act(async () => (action as HTMLElement).click());
  expect(openMediaListDialog).toHaveBeenCalledWith("playlist", photo);
});

it.each(["artist", "album"] as const)(
  "opens shared matching for a %s and retains it when its menu unmounts", async type => {
    useServerSession.setState({ canManageServer: true });
    const data = { ...metadata(type), guid: "local://42" } as Plex.Metadata;
    vi.mocked(getMediaMetadata).mockResolvedValue(data);
    await render(data);
    await click(host.querySelector("button"));
    await click(menuItem("Match…"));
    expect(useMetadataDialog.getState().selection).toMatchObject({ kind: "match", data: { ratingKey: "42", type } });
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Match: Song");
    await act(async () => root.render(<MetadataDialogHost />));
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Match: Song");
    await act(async () => useAuthSession.setState({ revision: 2 }));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(useMetadataDialog.getState().selection).toBeNull();
  },
);
it("uses Fix Match and Unmatch for an already matched album", async () => {
  useServerSession.setState({ canManageServer: true });
  const data = { ...metadata("album"), guid: "mbid://release" } as Plex.Metadata;
  vi.mocked(getMediaMetadata).mockResolvedValue(data);
  await render(data); await click(host.querySelector("button"));
  expect(menuItem("Fix Match…")).toBeTruthy(); expect(menuItem("Unmatch")).toBeTruthy();
});

it("uses loaded match identity when the original album card still has an unmatched GUID", async () => {
  useServerSession.setState({ canManageServer: true });
  vi.mocked(getMediaMetadata).mockResolvedValue({ ...metadata("album"), guid: "mbid://release" });
  await render({ ...item, type: "album", guid: "local://42" } as MediaItemData);
  await click(host.querySelector("button"));
  expect(menuItem("Fix Match…")).toBeTruthy(); expect(menuItem("Unmatch")).toBeTruthy();
});
