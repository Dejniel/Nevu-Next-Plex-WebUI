import { MemoryRouter, useLocation } from "react-router-dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  AuthStorage,
  useAuthSession,
  useServerSession,
} from "features/session/model";
import { ProxiedRequest } from "shared/api/backend";
import { serverQueryClient } from "shared/api/queryClient";
import EditMetadataDialog from "./EditMetadataDialog";
import { MediaActionDialogHost } from "./MediaActionDialogHost";
import {
  openMetadataDialog,
  useMediaActionDialog,
} from "../model/mediaActionDialog";
import {
  type MediaMetadata,
  getMediaMetadata,
  mediaMetadataQueryKey,
} from "entities/media/model";

vi.mock("shared/api/backend", () => ({
  ProxiedRequest: vi.fn(),
  getBackendURL: () => "",
}));
vi.mock("shared/ui", async () => ({
  AppDialog: (await import("shared/ui/AppDialog")).default,
}));
vi.mock("entities/media/api/media", async (original) => ({
  ...(await original<typeof import("entities/media/api/media")>()),
  getMediaMetadata: vi.fn(),
}));
const transport = vi.mocked(ProxiedRequest);
const original = {
  ratingKey: "42",
  librarySectionID: 2,
  type: "movie",
  title: "Movie",
  summary: "Summary",
  Genre: [{ id: 1, tag: "Drama" }],
  Role: [{ id: 2, tag: "Actor", role: "Character" }],
} as MediaMetadata;
let root: Root;
let host: HTMLDivElement;
let data: MediaMetadata;
const onSaved = vi.fn();
const onClose = vi.fn();
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  serverQueryClient.clear();
  useMediaActionDialog.setState({ selection: null });
  vi.mocked(getMediaMetadata).mockResolvedValue(original);
  AuthStorage.saveActiveSession({
    profile: null,
    accountToken: "account",
    serverToken: "token",
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
    server: { machineIdentifier: "local" } as Plex.ServerPreferences,
    canManageServer: true,
  });
  transport.mockResolvedValue({ status: 200, data: "" });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  data = original;
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  serverQueryClient.clear();
  vi.unstubAllGlobals();
});
const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 15));
  });
const render = async () => {
  await act(async () =>
    root.render(
      <EditMetadataDialog
        data={data}
        open
        onSaved={onSaved}
        onClose={onClose}
      />,
    ),
  );
  await settle();
};
const button = (name: string) =>
  Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
    (button) => button.textContent === name,
  )!;
const input = (name: string) => {
  const label = Array.from(document.querySelectorAll("label")).find(
    (label) => label.textContent?.replace(/\s*\*$/, "") === name,
  );
  return label
    ? (document.getElementById(label.htmlFor) as HTMLInputElement)
    : null;
};
const click = async (element: HTMLElement) => {
  expect(element).toBeTruthy();
  await act(async () => element.click());
  await settle();
};
const change = async (name: string, value: string) => {
  const element = input(name)!;
  expect(element).toBeTruthy();
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
};
const writes = () => transport.mock.calls.filter((call) => call[1] !== "GET");
const params = () => new URL(writes().at(-1)![0], "http://plex").searchParams;

it("preserves a draft across canonical refreshes and saves only edited values", async () => {
  await render();
  expect(button("Save").disabled).toBe(true);
  await change("Title", "My draft");
  data = {
    ...original,
    title: "Background refresh",
    summary: "New remote summary",
  };
  await render();
  expect(input("Title")!.value).toBe("My draft");
  await click(button("Save"));
  expect([...params()]).toEqual([
    ["type", "1"],
    ["id", "42"],
    ["title.value", "My draft"],
    ["title.locked", "1"],
  ]);
  expect(onSaved).toHaveBeenCalledTimes(1);
  expect(onClose).toHaveBeenCalledTimes(1);
});

it.each([
  { type: "photo", labels: ["Date taken"], artwork: "Thumbnail" },
  { type: "album", labels: ["Record label"], artwork: "Cover" },
  { type: "track", labels: ["Disc number", "Track artist"], artwork: "Cover" },
])(
  "uses the $type fields and shared artwork tabs",
  async ({ type, labels, artwork }) => {
    data = { ...original, type: type as MediaMetadata["type"] };
    await render();
    expect(input("Content rating")).toBeNull();
    expect(labels.map((label) => input(label))).not.toContain(null);
    await click(button("Artwork"));
    expect(button(artwork)).toBeTruthy();
  },
);

it("adds multi-value tags without submitting the form or changing other tag fields", async () => {
  await render();
  await click(button("Tags & people"));
  await change("Genres", "Comedy");
  await act(async () =>
    input("Genres")!.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        code: "Enter",
        bubbles: true,
      }),
    ),
  );
  expect(writes()).toEqual([]);
  expect(document.body.textContent).toContain("Comedy");
  await click(button("Save"));
  expect(params().get("genre[0].tag.tag")).toBe("Drama");
  expect(params().get("genre[1].tag.tag")).toBe("Comedy");
  expect(params().get("actor[].tag")).toBeNull();
  expect(params().get("label[].tag")).toBeNull();
});

it("retains a failed draft and retries only when requested", async () => {
  transport.mockResolvedValueOnce({ status: 400, data: "" });
  await render();
  await change("Title", "My draft");
  await click(button("Save"));
  expect(onSaved).not.toHaveBeenCalled();
  expect(input("Title")!.value).toBe("My draft");
  expect(document.body.textContent).toContain("Plex rejected");
  expect(writes()).toHaveLength(1);
  await click(button("Save"));
  expect(writes()).toHaveLength(2);
  expect(onSaved).toHaveBeenCalledTimes(1);
});

it("does not repeat accepted artwork after a failed metadata write, and preserves the final unlock", async () => {
  transport.mockImplementation(async (_path, method) =>
    method === "GET"
      ? {
          status: 200,
          data: {
            MediaContainer: {
              Metadata: [
                {
                  ratingKey: "metadata://current",
                  thumb: "/current",
                  selected: true,
                },
                { ratingKey: "metadata://new", thumb: "/new" },
              ],
            },
          },
        }
      : { status: 200, data: "" },
  );
  await render();
  await change("Title", "My draft");
  await click(button("Artwork"));
  await click(button("Poster"));
  await click(
    document.querySelector<HTMLElement>('[aria-label="Choose poster 2"]')!,
  );
  await click(
    document.querySelector<HTMLElement>(
      '[aria-label="Unlock Poster metadata"]',
    )!,
  );
  const succeed = transport.getMockImplementation()!;
  transport.mockImplementation(async (...args) =>
    args[1] === "PUT" && !args[0].includes("/poster?")
      ? { status: 400, data: "" }
      : succeed(...args),
  );
  await click(button("Save"));
  expect(writes()).toHaveLength(2);
  expect(document.body.textContent).toContain("Some artwork was saved");
  expect(params().get("thumb.locked")).toBe("0");
  transport.mockImplementation(succeed);
  await click(button("Save"));
  expect(writes()).toHaveLength(3);
  expect(writes()[2][0]).not.toContain("/poster?");
  expect(params().get("thumb.locked")).toBe("0");
  expect(onSaved).toHaveBeenCalledTimes(1);
});

it.each(["profile", "server", "revision", "item"])(
  "aborts a pending save on a %s change and ignores its late success",
  async (changeKind) => {
    let finish!: (value: { status: number; data: string }) => void;
    transport.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    await render();
    await change("Title", "My draft");
    await click(button("Save"));
    const signal = transport.mock.calls[0][4]!;
    await act(async () => {
      if (changeKind === "profile")
        useAuthSession.setState({ activeProfile: { id: 2 } as never });
      if (changeKind === "server")
        useServerSession.setState({
          server: { machineIdentifier: "other" } as Plex.ServerPreferences,
        });
      if (changeKind === "revision") useAuthSession.setState({ revision: 2 });
      if (changeKind === "item") {
        data = { ...original, ratingKey: "43" };
        root.render(
          <EditMetadataDialog
            data={data}
            open
            onSaved={onSaved}
            onClose={onClose}
          />,
        );
      }
    });
    expect(signal.aborted).toBe(true);
    await act(async () => finish({ status: 200, data: "" }));
    await settle();
    expect(onSaved).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  },
);

it("keeps the shared dialog and draft when its original virtualized card disappears", async () => {
  const scope = { serverId: "local", profileKey: "1:1" };
  serverQueryClient.setQueryData(mediaMetadataQueryKey(scope, "42"), original);
  const content = (card: boolean) => (
    <>
      {card && (
        <button onClick={() => openMetadataDialog(original, onSaved)}>
          Edit card
        </button>
      )}
      <MemoryRouter>
        <MediaActionDialogHost />
      </MemoryRouter>
    </>
  );
  await act(async () => root.render(content(true)));
  await click(button("Edit card"));
  await change("Title", "My draft");
  await act(async () => {
    root.render(content(false));
    serverQueryClient.setQueryData(mediaMetadataQueryKey(scope, "42"), {
      ...original,
      title: "Refreshed title",
    });
  });
  await settle();
  expect(input("Title")!.value).toBe("My draft");
  await click(button("Save"));
  expect(onSaved).toHaveBeenCalledTimes(1);
  expect(useMediaActionDialog.getState().selection).toBeNull();
});

it("closes the shared dialog and clears its selection when the active session changes", async () => {
  await act(async () => {
    root.render(
      <MemoryRouter>
        <MediaActionDialogHost />
      </MemoryRouter>,
    );
    openMetadataDialog(original, onSaved);
  });
  await settle();
  expect(document.querySelector('[role="dialog"]')).toBeTruthy();
  await act(async () => useAuthSession.setState({ revision: 2 }));
  expect(useMediaActionDialog.getState().selection).toBeNull();
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(onSaved).not.toHaveBeenCalled();
});

it.each([
  { changeKind: "revision", selectedID: undefined },
  { changeKind: "item", selectedID: "43" },
])(
  "ignores an accepted save callback after a $changeKind change",
  async ({ changeKind, selectedID }) => {
    const other = { ...original, ratingKey: "43", title: "Second item" };
    serverQueryClient.setQueryData(
      mediaMetadataQueryKey({ serverId: "local", profileKey: "1:1" }, "43"),
      other,
    );
    const config = serverQueryClient.getMutationCache().config;
    const previous = config.onSuccess;
    config.onSuccess = () => {
      if (changeKind === "revision") useAuthSession.setState({ revision: 2 });
      else openMetadataDialog(other);
    };
    try {
      await act(async () => {
        root.render(
          <MemoryRouter>
            <MediaActionDialogHost />
          </MemoryRouter>,
        );
        openMetadataDialog(original, onSaved);
      });
      await settle();
      await change("Title", "My draft");
      await click(button("Save"));
      expect(writes()).toHaveLength(1);
      expect(onSaved).not.toHaveBeenCalled();
      const opened = useMediaActionDialog.getState().selection;
      expect(
        opened && "data" in opened ? opened.data.ratingKey : undefined,
      ).toBe(selectedID);
    } finally {
      config.onSuccess = previous;
    }
  },
);

it("keeps ordinary edits across all four sections and loads settings only when opened", async () => {
  transport.mockImplementation(async (_path, method) =>
    method === "GET"
      ? {
          status: 200,
          data: {
            MediaContainer: {
              Metadata: [{ ...original, Preferences: { Setting: [] } }],
            },
          },
        }
      : { status: 200, data: "" },
  );
  await render();
  await change("Title", "Draft title");
  expect(transport).not.toHaveBeenCalled();
  await click(button("Advanced"));
  expect(document.body.textContent).toContain("No item-specific settings");
  expect(transport.mock.calls[0][0]).toContain("includePreferences=1");
  await click(button("General"));
  expect(input("Title")!.value).toBe("Draft title");
  await click(button("Save"));
  expect(params().get("title.value")).toBe("Draft title");
});

it("retains a rejected settings draft and retries its read without losing the title", async () => {
  transport.mockResolvedValueOnce({ status: 503, data: "" });
  await render();
  await change("Title", "Draft title");
  await click(button("Advanced"));
  expect(document.body.textContent).toContain("503");
  transport.mockResolvedValue({
    status: 200,
    data: {
      MediaContainer: {
        Metadata: [{ ...original, Preferences: { Setting: [] } }],
      },
    },
  });
  await click(button("Retry"));
  expect(document.body.textContent).toContain("No item-specific settings");
  await click(button("General"));
  expect(input("Title")!.value).toBe("Draft title");
});

it("does not repeat saved preferences after a later metadata error", async () => {
  let enabled = false;
  let failMetadata = true;
  transport.mockImplementation(async (path, method) => {
    if (method === "GET")
      return {
        status: 200,
        data: {
          MediaContainer: {
            Metadata: [
              {
                ...original,
                Preferences: {
                  Setting: [
                    {
                      id: "useOriginalTitle",
                      label: "Use original title",
                      type: "bool",
                      value: enabled,
                      default: false,
                    },
                  ],
                },
              },
            ],
          },
        },
      };
    if (path.includes("/prefs?")) {
      enabled = true;
      return { status: 200, data: "" };
    }
    return { status: failMetadata ? 400 : 200, data: "" };
  });
  await render();
  await change("Title", "Draft title");
  await click(button("Advanced"));
  await click(
    document.querySelector<HTMLInputElement>('input[type="checkbox"]')!,
  );
  await click(button("Save"));
  expect(onSaved).not.toHaveBeenCalled();
  expect(document.body.textContent).toContain("Item settings were saved");
  failMetadata = false;
  await click(button("Save"));
  expect(writes().filter((call) => call[0].includes("/prefs?"))).toHaveLength(
    1,
  );
  expect(onSaved).toHaveBeenCalledTimes(1);
});

it("continues a partially failed album merge using its surviving identity and does not upload artwork twice", async () => {
  const source = {
    ...original,
    type: "album",
    title: "Source",
    parentRatingKey: "7",
    parentTitle: "Artist",
  } as MediaMetadata;
  const target = { ...source, ratingKey: "84", title: "Destination" };
  data = source;
  let merged = false;
  let failFields = true;
  transport.mockImplementation(async (path, method) => {
    const url = new URL(path, "http://plex");
    if (method === "GET") {
      if (url.pathname.endsWith("/posters"))
        return {
          status: 200,
          data: {
            MediaContainer: {
              Metadata: [{ ratingKey: "metadata://new", thumb: "/new" }],
            },
          },
        };
      if (url.pathname.startsWith("/library/sections/"))
        return {
          status: 200,
          data: { MediaContainer: { Metadata: [target] } },
        };
      if (url.pathname === "/library/metadata/42" && merged)
        return { status: 404, data: "" };
      return {
        status: 200,
        data: { MediaContainer: { Metadata: [merged ? target : source] } },
      };
    }
    if (url.searchParams.get("id") === "42") {
      merged = true;
      return { status: 200, data: "" };
    }
    return {
      status: url.searchParams.get("id") === "84" && failFields ? 400 : 200,
      data: "",
    };
  });
  await render();
  await change("Title", "Destination");
  await click(button("Artwork"));
  await click(
    document.querySelector<HTMLElement>('[aria-label="Choose cover 1"]')!,
  );
  await click(button("Save"));
  expect(onSaved).not.toHaveBeenCalled();
  expect(document.body.textContent).toContain("Plex merged the music items");
  failFields = false;
  await click(button("Save"));
  expect(
    writes().filter(
      (call) => new URL(call[0], "http://plex").searchParams.get("id") === "42",
    ),
  ).toHaveLength(1);
  expect(writes().filter((call) => call[0].includes("/poster?"))).toHaveLength(
    1,
  );
  expect(onSaved).toHaveBeenCalledWith({ ratingKey: "84" });
});

function CurrentEditorRoute() {
  const location = useLocation();
  return (
    <output data-testid="route">
      {location.pathname}
      {location.search}
    </output>
  );
}

it.each([
  { from: "/browse/2/item/42", to: "/browse/2/item/84", partial: false },
  {
    from: "/browse/2?mid=42&detailsTab=details",
    to: "/browse/2?mid=84&detailsTab=details",
    partial: true,
  },
])(
  "follows the merged identity from $from, including partial saves",
  async ({ from, to, partial }) => {
    const source = {
      ...original,
      type: "album",
      title: "Source",
      parentRatingKey: "7",
      parentTitle: "Artist",
    } as MediaMetadata;
    const target = { ...source, ratingKey: "84", title: "Destination" };
    vi.mocked(getMediaMetadata).mockResolvedValue(source);
    transport.mockImplementation(async (path, method) => {
      const url = new URL(path, "http://plex");
      if (method === "GET")
        return {
          status: 200,
          data: {
            MediaContainer: {
              Metadata: url.pathname.startsWith("/library/sections/")
                ? [target]
                : [source],
            },
          },
        };
      return {
        status: partial && url.searchParams.get("id") === "84" ? 400 : 200,
        data: "",
      };
    });
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={[from]}>
          <MediaActionDialogHost />
          <CurrentEditorRoute />
        </MemoryRouter>,
      );
      openMetadataDialog(source, onSaved);
    });
    await settle();
    await change("Title", "Destination");
    await click(button("Save"));
    expect(document.querySelector('[data-testid="route"]')?.textContent).toBe(
      to,
    );
    expect(
      document.body.textContent?.includes("Plex merged the music items"),
    ).toBe(partial);
    expect(onSaved).toHaveBeenCalledTimes(partial ? 0 : 1);
  },
);

it("cancels pending preference reads when the opened session changes", async () => {
  let finish!: (response: { status: number; data: unknown }) => void;
  transport.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  await render();
  await click(button("Advanced"));
  const signal = transport.mock.calls[0][4]!;
  await act(async () => useAuthSession.setState({ revision: 2 }));
  expect(signal.aborted).toBe(true);
  await act(async () =>
    finish({
      status: 200,
      data: {
        MediaContainer: {
          Metadata: [
            {
              ...original,
              Preferences: {
                Setting: [
                  {
                    id: "old",
                    label: "Old session preference",
                    type: "bool",
                    value: false,
                    default: false,
                  },
                ],
              },
            },
          ],
        },
      },
    }),
  );
  await settle();
  expect(document.body.textContent).not.toContain("Old session preference");
  expect(writes()).toEqual([]);
});

it("shows existing edition information read-only when its owner has no Plex Pass", async () => {
  data = {
    ...original,
    editionTitle: "Director's Cut",
    Field: [{ name: "editionTitle", locked: true }],
  };
  await render();
  expect(input("Edition")?.disabled).toBe(true);
  expect(
    document.querySelector<HTMLButtonElement>(
      '[aria-label="Unlock Edition metadata"]',
    )?.disabled,
  ).toBe(true);
  expect(writes()).toEqual([]);
});

it("shows existing music parents before typing without sending an undefined title filter", async () => {
  data = {
    ...original,
    type: "album",
    parentRatingKey: "7",
    parentTitle: "Current artist",
  };
  transport.mockResolvedValue({
    status: 200,
    data: {
      MediaContainer: {
        size: 2,
        Metadata: [
          {
            ratingKey: "7",
            title: "Current artist",
            type: "artist",
            librarySectionID: 2,
          },
          {
            ratingKey: "8",
            title: "Another artist",
            type: "artist",
            librarySectionID: 2,
          },
        ],
      },
    },
  });
  await render();
  await click(document.querySelector('[aria-label="Open"]')!);
  expect(document.body.textContent).toContain("Another artist");
  const request = transport.mock.calls.find(([url]) =>
    url.startsWith("/library/sections/2/all"),
  )!;
  expect(new URL(request[0], "http://plex").searchParams.has("title")).toBe(
    false,
  );
  expect(writes()).toEqual([]);
});
