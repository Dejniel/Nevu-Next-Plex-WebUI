import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { notifyManager } from "@tanstack/react-query";
import { normalizePlexPreferences } from "@nevu/contracts";
import {
  AuthStorage,
  useAuthSession,
  useServerSession,
} from "features/session/model";
import { serverQueryClient } from "shared/api/queryClient";
import {
  browseLibraryFolders,
  createLibrary,
  deleteLibrary,
  runLibraryAction,
  getManagedLibraries,
  getManagedLibrary,
  updateLibrary,
} from "entities/library/model";
import type { LibraryDetails } from "entities/library/model";
import SettingsLibrariesAdmin from "./SettingsLibrariesAdmin";

vi.mock("entities/library/model", () => ({
  getManagedLibraries: vi.fn(),
  getManagedLibrary: vi.fn(),
  browseLibraryFolders: vi.fn(),
  createLibrary: vi.fn(),
  updateLibrary: vi.fn(),
  deleteLibrary: vi.fn(),
  runLibraryAction: vi.fn(),
  notifyLibrariesChanged: vi.fn(),
}));
const initial: LibraryDetails = {
  library: {
    id: "1",
    uuid: "movies",
    title: "Movies",
    type: "movie",
    agent: "agent",
    scanner: "scanner",
    language: "en-US",
    locations: ["/data"],
    refreshing: false,
    updatedAt: null,
    scannedAt: null,
  },
  preferences: normalizePlexPreferences([
    {
      id: "enabled",
      label: "Enabled",
      summary: "Preference description",
      type: "bool",
      value: false,
      default: true,
    },
    { id: "ratio", label: "Ratio", type: "double", value: 0.75, default: 0.5 },
  ]),
};
let root: Root;
let host: HTMLDivElement;
async function render(path: string) {
  await act(async () =>
    root.render(
      <MemoryRouter key={path} initialEntries={[path]}>
        <SettingsLibrariesAdmin />
      </MemoryRouter>,
    ),
  );
  await flush();
}
const button = (text: string) =>
  [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (element) => element.textContent === text,
  )!;
const field = (name: string) => {
  const label = [...document.querySelectorAll<HTMLLabelElement>("label")].find(
    (label) => label.textContent === name,
  )!;
  return document.getElementById(label.htmlFor) as HTMLInputElement;
};
async function changeInput(name: string, value: string) {
  await act(async () => {
    const input = field(name);
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function chooseSelect(name: string, label: string) {
  const control = [
    ...document.querySelectorAll<HTMLElement>('[role="combobox"]'),
  ].find((control) =>
    control
      .getAttribute("aria-labelledby")
      ?.split(" ")
      .some((id) => document.getElementById(id)?.textContent === name),
  )!;
  await act(async () =>
    control.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })),
  );
  const option = [
    ...document.querySelectorAll<HTMLElement>('[role="option"]'),
  ].find((item) => item.textContent === label)!;
  await act(async () => option.click());
}
async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
}
async function click(text: string) {
  const button = [
    ...document.querySelectorAll<HTMLButtonElement>("button"),
  ].find((element) => element.textContent === text)!;
  await act(async () => button.click());
  await flush();
}
beforeAll(() => notifyManager.setScheduler(queueMicrotask));
afterAll(() =>
  notifyManager.setScheduler((callback) => setTimeout(callback, 0)),
);
beforeEach(async () => {
  vi.resetAllMocks();
  serverQueryClient.clear();
  localStorage.clear();
  sessionStorage.clear();
  AuthStorage.saveActiveSession({
    profile: null,
    accountToken: "account",
    serverToken: "server",
  });
  useAuthSession.setState({
    status: "ready",
    revision: 1,
    activeUser: { restricted: false } as Plex.UserData,
  });
  useServerSession.setState({
    server: { machineIdentifier: "local" } as Plex.ServerPreferences,
    canManageServer: true,
  });
  vi.mocked(getManagedLibraries).mockResolvedValue([initial.library]);
  vi.mocked(getManagedLibrary).mockResolvedValue(initial);
  vi.mocked(updateLibrary).mockResolvedValue(undefined);
  vi.mocked(createLibrary).mockResolvedValue(undefined);
  vi.mocked(deleteLibrary).mockResolvedValue(undefined);
  vi.mocked(runLibraryAction).mockResolvedValue(undefined);
  vi.mocked(browseLibraryFolders).mockImplementation(async (key) =>
    key === "/services/browse/Lw=="
      ? [{ key: "/services/browse/ZGF0YQ==", title: "data", path: "/data" }]
      : [
          { key: "/services/browse/ZGF0YQ==", title: "data", path: "/data" },
          {
            key: "/services/browse/bW92aWVz",
            title: "movies",
            path: "/data/movies",
          },
        ],
  );
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={["/settings/manage-libraries?edit=1"]}>
        <SettingsLibrariesAdmin />
      </MemoryRouter>,
    ),
  );
  await flush();
  await click("Advanced");
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  serverQueryClient.clear();
  vi.unstubAllGlobals();
});

it("uses the shared field renderer and sends only the changed preference", async () => {
  expect(document.body.textContent).toContain("Preference description");
  await act(async () =>
    document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click(),
  );
  await click("Save");
  expect(updateLibrary).toHaveBeenCalledWith(
    "1",
    {
      preferences: { enabled: "1" },
    },
    { token: "account", signal: expect.any(AbortSignal) },
  );
});

it("preserves edits while taking untouched fields from a background read", async () => {
  await act(async () =>
    document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click(),
  );
  vi.mocked(getManagedLibrary).mockResolvedValueOnce({
    ...initial,
    library: { ...initial.library, title: "External name" },
    preferences: initial.preferences.map((setting) => ({
      ...setting,
      value: setting.id === "ratio" ? "0.9" : setting.value,
    })),
  });
  await act(async () => {
    await serverQueryClient.invalidateQueries({
      queryKey: ["plex-library-administration", "local", 1, "library", "1"],
      exact: true,
    });
  });
  expect(
    document.querySelector<HTMLInputElement>('input[type="number"]')!.value,
  ).toBe("0.9");
  await click("Save");
  expect(updateLibrary).toHaveBeenCalledWith(
    "1",
    expect.objectContaining({
      preferences: { enabled: "1" },
    }),
    expect.any(Object),
  );
});

it("keeps a failed save open with its draft for retry", async () => {
  await act(async () =>
    document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click(),
  );
  vi.mocked(updateLibrary).mockRejectedValueOnce(new Error("Write failed"));
  await click("Save");
  expect(document.body.textContent).toContain("Write failed");
  expect(
    document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked,
  ).toBe(true);
  await click("Save");
  expect(updateLibrary).toHaveBeenCalledTimes(2);
});

it("aborts a library save when its profile changes and suppresses late completion", async () => {
  let finish!: () => void;
  vi.mocked(updateLibrary).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await act(async () =>
    document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click(),
  );
  await click("Save");
  const signal = vi.mocked(updateLibrary).mock.calls[0][2]!.signal!;
  await act(async () => useAuthSession.setState({ revision: 2 }));
  expect(signal.aborted).toBe(true);
  await act(async () => finish());
  await flush();
  expect(document.body.textContent).not.toContain("Library updated.");
});

it("shows validation in the appropriate tab before attempting a create", async () => {
  await render("/settings/manage-libraries?add=1");
  await click("Save");
  expect(document.body.textContent).toContain("Enter a library name.");
  expect(createLibrary).not.toHaveBeenCalled();
  await changeInput("Name", "Samples");
  await click("Save");
  expect(
    document.querySelector('[role="tab"][aria-selected="true"]')?.textContent,
  ).toBe("Folders");
  expect(document.body.textContent).toContain("Select at least one folder.");
  expect(createLibrary).not.toHaveBeenCalled();
});

it.each([
  { type: "artist", label: "Music", language: "pl-PL" },
  { type: "video", label: "Other videos", language: "xn" },
])(
  "creates $label with its metadata language and deduplicated server folders",
  async ({ type, label, language }) => {
    await render("/settings/manage-libraries?add=1");
    await changeInput("Name", " New library ");
    await chooseSelect("Library type", label);
    expect(document.querySelectorAll('[role="combobox"]')).toHaveLength(
      type === "video" ? 1 : 2,
    );
    if (type !== "video") {
      await chooseSelect("Language", "Polish");
    }
    await click("Folders");
    expect(browseLibraryFolders).not.toHaveBeenCalled();
    await click("Add folder");
    expect(button("Select").disabled).toBe(true);
    const data = [
      ...document.querySelectorAll<HTMLElement>(
        '[role="dialog"] [role="button"]',
      ),
    ].find((item) => item.textContent?.includes("data"))!;
    await act(async () => data.click());
    await flush();
    await click("Select");
    expect([...document.querySelectorAll('[role="dialog"]')]).toHaveLength(1);
    await click("Add folder");
    expect(button("Select").disabled).toBe(true);
    await act(async () =>
      [
        ...document.querySelectorAll<HTMLElement>(
          '[role="dialog"] [role="button"]',
        ),
      ]
        .find((item) => item.textContent?.includes("data"))!
        .click(),
    );
    await flush();
    await click("Select");
    await click("Save");
    expect(createLibrary).toHaveBeenCalledWith(
      {
        name: "New library",
        type,
        language,
        locations: ["/data"],
      },
      { token: "account", signal: expect.any(AbortSignal) },
    );
    expect(document.body.textContent).toContain("Library created.");
  },
);

it("validates advanced values against the shared descriptors before a write", async () => {
  const input = document.querySelector<HTMLInputElement>(
    'input[type="number"]',
  )!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(input, "");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await click("Save");
  expect(document.body.textContent).toContain("Ratio: Enter a finite number.");
  expect(updateLibrary).not.toHaveBeenCalled();
});

it("uses fresh untouched general fields and sends only an edited name", async () => {
  await click("General");
  await changeInput("Name", " My movies ");
  vi.mocked(getManagedLibrary).mockResolvedValueOnce({
    ...initial,
    library: { ...initial.library, language: "pl-PL", locations: ["/archive"] },
  });
  await act(async () =>
    serverQueryClient.invalidateQueries({
      queryKey: ["plex-library-administration", "local", 1, "library", "1"],
      exact: true,
    }),
  );
  expect(document.querySelector('[role="combobox"]')?.textContent).toBe(
    "Polish",
  );
  await click("Save");
  expect(updateLibrary).toHaveBeenCalledWith(
    "1",
    { name: "My movies" },
    { token: "account", signal: expect.any(AbortSignal) },
  );
});

it("prevents duplicate submits and leaves fields disabled until the owner finishes the save", async () => {
  let finish!: () => void;
  vi.mocked(updateLibrary).mockImplementationOnce(
    () => new Promise((resolve) => (finish = resolve)),
  );
  await act(async () =>
    document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click(),
  );
  await act(async () => {
    button("Save").click();
    button("Save").click();
  });
  expect(updateLibrary).toHaveBeenCalledTimes(1);
  expect(button("Saving...").disabled).toBe(true);
  expect(
    document.querySelector<HTMLInputElement>('input[type="checkbox"]')!
      .disabled,
  ).toBe(true);
  await act(async () => finish());
  expect(document.body.textContent).toContain("Library updated.");
});

it("cancels an in-flight folder read when the browser closes and starts again at root", async () => {
  let finish!: (
    paths: Awaited<ReturnType<typeof browseLibraryFolders>>,
  ) => void;
  vi.mocked(browseLibraryFolders).mockImplementationOnce(
    () => new Promise((resolve) => (finish = resolve)),
  );
  await click("Folders");
  await click("Add folder");
  const signal = vi.mocked(browseLibraryFolders).mock.calls[0][1]!.signal!;
  const dialogs = [...document.querySelectorAll('[role="dialog"]')];
  await act(async () =>
    dialogs
      .at(-1)!
      .querySelector<HTMLButtonElement>('[aria-label="Close dialog"]')!
      .click(),
  );
  expect(signal.aborted).toBe(true);
  await act(async () =>
    finish([
      { key: "/services/browse/b2xk", title: "Old result", path: "/old" },
    ]),
  );
  await click("Add folder");
  expect(document.body.textContent).not.toContain("Old result");
  expect(button("Select").disabled).toBe(true);
});

it("keeps failed library deletion open for a retry", async () => {
  await render("/settings/manage-libraries?delete=1");
  vi.mocked(deleteLibrary).mockRejectedValueOnce(new Error("Delete failed"));
  await click("Delete");
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
    "Delete failed",
  );
  await click("Delete");
  expect(deleteLibrary).toHaveBeenCalledTimes(2);
  expect(deleteLibrary).toHaveBeenLastCalledWith("1", "Movies", {
    token: "account",
    signal: expect.any(AbortSignal),
  });
  expect(document.body.textContent).toContain("Library deleted.");
});

it("keeps a failed confirmed maintenance action in its own dialog for retry", async () => {
  await render("/settings/manage-libraries");
  vi.mocked(runLibraryAction).mockRejectedValueOnce(
    new Error("Maintenance failed"),
  );
  await act(async () =>
    document
      .querySelector<HTMLButtonElement>(
        '[aria-label="Actions for library Movies"]',
      )!
      .click(),
  );
  await act(async () =>
    [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')]
      .find((item) => item.textContent === "Refresh all metadata")!
      .click(),
  );
  await click("Continue");
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
    "Maintenance failed",
  );
  await click("Continue");
  expect(runLibraryAction).toHaveBeenCalledTimes(2);
  expect(runLibraryAction).toHaveBeenLastCalledWith("1", "refresh-metadata", {
    token: "account",
    signal: expect.any(AbortSignal),
  });
  expect(document.body.textContent).toContain("Library action started.");
});

it("allows retrying an unreadable library instead of presenting an empty editable form", async () => {
  vi.mocked(getManagedLibrary).mockRejectedValueOnce(
    new Error("Library unavailable"),
  );
  await render("/settings/manage-libraries?edit=2");
  expect(document.body.textContent).toContain("Library unavailable");
  expect(button("Save").disabled).toBe(true);
  expect(document.querySelector("input")).toBeNull();
  await click("Retry");
  expect(field("Name").value).toBe("Movies");
  expect(updateLibrary).not.toHaveBeenCalled();
});
