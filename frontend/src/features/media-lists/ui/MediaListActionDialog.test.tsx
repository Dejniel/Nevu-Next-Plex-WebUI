import type { Mock } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useUserSettings } from "features/settings/model";
import { getMediaListChoices, saveMediaListItem } from "../api/mediaLists";
import {
  openMediaListDialog,
  useMediaListDialog,
} from "../model/mediaListDialog";
import type { MediaListSummary } from "../model/mediaLists";
import MediaListActionDialog from "./MediaListActionDialog";

vi.mock("../api/mediaLists", () => ({
  getMediaListChoices: vi.fn(),
  saveMediaListItem: vi.fn(),
}));
vi.mock("shared/ui", async () => ({
  AppDialog: (await import("shared/ui/AppDialog")).default,
}));
vi.mock("react-router-dom", async () => {
  const React = await import("react");
  return {
    Link: React.forwardRef(function Link(
      { to, children, ...props }: { to: string; children?: React.ReactNode },
      ref: React.Ref<HTMLAnchorElement>,
    ) {
      return (
        <a {...props} href={to} ref={ref}>
          {children}
        </a>
      );
    }),
  };
});

const choices = getMediaListChoices as Mock;
const save = saveMediaListItem as Mock;
const movie = {
  ratingKey: "3",
  title: "Movie",
  type: "movie" as const,
  librarySectionID: 2,
};
const saved: MediaListSummary = {
  kind: "playlist",
  id: "20",
  title: "Weekend",
  summary: "",
  count: 1,
  smart: false,
};
let root: Root;
let host: HTMLDivElement;

beforeEach(async () => {
  vi.resetAllMocks();
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  useUserSettings.setState({ profileKey: "owner:1" });
  useMediaListDialog.setState({ selection: null });
  choices.mockResolvedValue([]);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<MediaListActionDialog />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

it("cancels choices and discards late results when the active profile changes", async () => {
  let finish!: (lists: MediaListSummary[]) => void;
  choices.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  await act(async () => openMediaListDialog("playlist", movie));
  const signal = choices.mock.calls[0][2] as AbortSignal;
  expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  await act(async () => useUserSettings.setState({ profileKey: "owner:2" }));
  expect(signal.aborted).toBe(true);
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  await act(async () => finish([saved]));
  expect(useMediaListDialog.getState().selection).toBeNull();
  await act(async () => openMediaListDialog("playlist", movie));
  expect(choices).toHaveBeenCalledTimes(2);
  expect(document.querySelector('[role="dialog"]')?.textContent).not.toContain(
    "Weekend",
  );
});

it("does not show a previous profile's delayed save result", async () => {
  let finish!: (list: MediaListSummary) => void;
  save.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  await act(async () => openMediaListDialog("playlist", movie));
  const input = document.querySelector("input")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(input, "Weekend");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const button = Array.from(document.querySelectorAll("button")).find(
    (button) => button.textContent === "Create and add",
  )!;
  expect(button.disabled).toBe(false);
  await act(async () => button.click());
  expect(save).toHaveBeenCalledWith("playlist", movie, { title: "Weekend" });
  await act(async () => useUserSettings.setState({ profileKey: "owner:2" }));
  await act(async () => finish(saved));
  expect(document.body.textContent).not.toContain("Added to");
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});

it("creates a photo album in the shared dialog and links to its library album view", async () => {
  const photo = { ...movie, type: "photo" as const, librarySectionID: 5 };
  save.mockResolvedValue({ ...saved, playlistType: "photo" });
  await act(async () => openMediaListDialog("playlist", photo));
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
    "Add to album",
  );
  expect(document.body.textContent).toContain("Album name");
  const input = document.querySelector("input")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(input, "Trip");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const button = Array.from(document.querySelectorAll("button")).find(
    (button) => button.textContent === "Create and add",
  )!;
  await act(async () => button.click());
  expect(save).toHaveBeenCalledWith("playlist", photo, { title: "Trip" });
  expect(document.querySelector("a")?.getAttribute("href")).toBe(
    "/browse/5?list=20&view=playlists",
  );
});
