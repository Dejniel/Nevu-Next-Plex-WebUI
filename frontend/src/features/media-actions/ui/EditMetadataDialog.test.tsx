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
    expect(button(artwork)).toBeTruthy();
  },
);

it("adds multi-value tags without submitting the form or changing other tag fields", async () => {
  await render();
  await click(button("Tags"));
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
      <MediaActionDialogHost />
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
    root.render(<MediaActionDialogHost />);
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
        root.render(<MediaActionDialogHost />);
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
