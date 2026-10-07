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
