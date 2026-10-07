import { notifyManager } from "@tanstack/react-query";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { serverQueryClient } from "shared/api/queryClient";
import {
  AuthStorage,
  useAuthSession,
  useServerSession,
} from "features/session/model";
import { useUserSettings } from "features/settings/model";
import * as listSync from "../model/listSync";
import { editPlaylist } from "../api/playlistEditing";
import type { MediaListEntry, MediaListSummary } from "../model/mediaLists";
import PlaylistEditor, { type PlaylistAction } from "./PlaylistEditor";

vi.mock("../api/playlistEditing", () => ({ editPlaylist: vi.fn() }));
vi.mock("shared/ui", async () => ({
  AppDialog: (await import("shared/ui/AppDialog")).default,
}));
const save = vi.mocked(editPlaylist);
const playlist: MediaListSummary = {
  kind: "playlist",
  id: "20",
  title: "Weekend",
  summary: "Description",
  count: 40,
  smart: false,
};
const entry: MediaListEntry = {
  kind: "media",
  position: 9,
  playlistItemID: "109",
  supported: true,
  item: {
    title: "Repeated movie",
    ratingKey: "3",
    type: "movie",
  } as Plex.Metadata,
};
const deleted = vi.fn();
let root: Root;
let host: HTMLDivElement;
let initial: PlaylistAction | null;
let profile: string;
function Harness() {
  const [selected, setSelected] = useState(initial);
  return (
    <PlaylistEditor
      key={profile}
      playlist={playlist}
      total={40}
      scope={{ serverId: "local", profileKey: profile }}
      selected={selected}
      onSelect={setSelected}
      onClose={() => setSelected(null)}
      onDeleted={deleted}
    />
  );
}
const render = async () => {
  await act(async () => root.render(<Harness />));
};
const button = (label: string) =>
  Array.from(document.querySelectorAll("button")).find(
    (element) => element.textContent === label,
  )!;
const click = async (label: string) => {
  await act(async () => button(label).click());
};
const input = (label: string) => {
  const id = Array.from(document.querySelectorAll("label")).find(
    (element) => element.textContent === label,
  )!.htmlFor;
  return document.getElementById(id) as HTMLInputElement;
};
const type = async (label: string, value: string) => {
  await act(async () => {
    const element = input(label);
    const prototype =
      element.tagName === "TEXTAREA"
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(
      element,
      value,
    );
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
};
beforeAll(() => notifyManager.setScheduler(queueMicrotask));
afterAll(() =>
  notifyManager.setScheduler((callback) => setTimeout(callback, 0)),
);
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  serverQueryClient.clear();
  initial = null;
  profile = "owner:2";
  AuthStorage.saveActiveSession({
    profile: null,
    accountToken: "account",
    serverToken: "server",
  });
  useAuthSession.setState({ status: "ready", revision: 1 });
  useUserSettings.setState({ profileKey: profile });
  useServerSession.setState({
    server: { machineIdentifier: "local" } as Plex.ServerPreferences,
  });
  save.mockResolvedValue({
    kind: "list",
    listKind: "playlist",
    id: "20",
    serverId: "local",
    profileKey: profile,
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  serverQueryClient.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("opens editing from the playlist menu and saves name and description", async () => {
  await render();
  await act(async () =>
    (
      document.querySelector('[aria-label="Playlist actions"]') as HTMLElement
    ).click(),
  );
  const edit = Array.from(document.querySelectorAll('[role="menuitem"]')).find(
    (element) => element.textContent === "Edit playlist…",
  )!;
  await act(async () => (edit as HTMLElement).click());
  expect(input("Playlist name").value).toBe("Weekend");
  expect(input("Description").value).toBe("Description");
  await type("Playlist name", " ");
  expect(button("Save").disabled).toBe(true);
  await type("Playlist name", "New name");
  await type("Description", "New description");
  await click("Save");
  expect(save).toHaveBeenCalledWith(
    "20",
    { type: "details", title: "New name", summary: "New description" },
    expect.any(AbortSignal),
  );
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});

it("supports arbitrary positions and first/last on keyboard and touch without accepting invalid or unchanged values", async () => {
  initial = { type: "move", entry };
  await render();
  expect(input("Position").value).toBe("10");
  expect(button("Move").disabled).toBe(true);
  for (const value of ["", "0", "41", "2.5"]) {
    await type("Position", value);
    expect(button("Move").disabled).toBe(true);
  }
  await click("First");
  expect(input("Position").value).toBe("1");
  await click("Last");
  expect(input("Position").value).toBe("40");
  await click("Move");
  expect(save).toHaveBeenCalledWith(
    "20",
    { type: "move", entry, position: 39, total: 40 },
    expect.any(AbortSignal),
  );
});

it("confirms the exact repeated occurrence and retains the dialog after an error", async () => {
  initial = { type: "remove", entry };
  save.mockRejectedValueOnce(new Error("Plex denied this operation"));
  await render();
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
    "position 10",
  );
  expect(save).not.toHaveBeenCalled();
  await click("Remove");
  expect(document.querySelector('[role="alert"]')?.textContent).toContain(
    "Plex denied",
  );
  expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  await click("Remove");
  expect(save.mock.lastCall?.[1]).toEqual({ type: "remove", entry });
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});

it("returns to the playlist list only after confirmed deletion succeeds", async () => {
  initial = { type: "delete" };
  let finish!: (value: Awaited<ReturnType<typeof editPlaylist>>) => void;
  save.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await render();
  expect(save).not.toHaveBeenCalled();
  await click("Delete playlist");
  expect(deleted).not.toHaveBeenCalled();
  expect(button("Cancel").disabled).toBe(true);
  await act(async () =>
    finish({
      kind: "list",
      listKind: "playlist",
      effect: "removed",
      id: "20",
      serverId: "local",
      profileKey: profile,
    }),
  );
  expect(deleted).toHaveBeenCalledTimes(1);
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});

it("aborts an unmounted profile's request and ignores its delayed deletion result", async () => {
  initial = { type: "delete" };
  let finish!: (value: Awaited<ReturnType<typeof editPlaylist>>) => void;
  save.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await render();
  await click("Delete playlist");
  const signal = save.mock.calls[0][2];
  profile = "owner:3";
  useUserSettings.setState({ profileKey: profile });
  await render();
  expect(signal.aborted).toBe(true);
  await act(async () =>
    finish({
      kind: "list",
      listKind: "playlist",
      id: "20",
      serverId: "local",
      profileKey: "owner:2",
      effect: "removed",
    }),
  );
  expect(deleted).not.toHaveBeenCalled();
});

it("closes after a successful write even if cache revalidation fails, without repeating the write", async () => {
  initial = { type: "remove", entry };
  vi.spyOn(listSync, "applyMediaListChanges").mockRejectedValueOnce(
    new Error("Reload failed"),
  );
  await render();
  await click("Remove");
  expect(save).toHaveBeenCalledTimes(1);
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});

it("does not send a previous profile's action even before its editor unmounts", async () => {
  initial = { type: "delete" };
  await render();
  useUserSettings.setState({ profileKey: "owner:3" });
  await click("Delete playlist");
  expect(save).not.toHaveBeenCalled();
  expect(document.querySelector('[role="alert"]')?.textContent).toContain(
    "profile changed",
  );
});

it("ignores a confirmed deletion if the session changes during list revalidation", async () => {
  initial = { type: "delete" };
  let finish!: () => void;
  vi.spyOn(listSync, "applyMediaListChanges").mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await render();
  await click("Delete playlist");
  const signal = save.mock.calls[0][2];
  await act(async () => useAuthSession.setState({ revision: 2 }));
  expect(signal.aborted).toBe(true);
  await act(async () => finish());
  expect(deleted).not.toHaveBeenCalled();
});

it("blocks a write immediately after sign-out, even if its editor is still mounted", async () => {
  initial = { type: "delete" };
  await render();
  await act(async () => useAuthSession.setState({ status: "signedOut" }));
  await click("Delete playlist");
  expect(save).not.toHaveBeenCalled();
});
