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

jest.mock("../api/mediaLists", () => ({
  getMediaListChoices: jest.fn(),
  saveMediaListItem: jest.fn(),
}));
jest.mock("shared/ui", () => ({
  AppDialog: require("shared/ui/AppDialog").default,
}));
jest.mock("react-router-dom", () => {
  const React = require("react");
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

const choices = getMediaListChoices as jest.Mock;
const save = saveMediaListItem as jest.Mock;
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
  jest.resetAllMocks();
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
