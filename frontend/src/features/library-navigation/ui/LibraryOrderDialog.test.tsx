import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useUserSettings } from "features/settings/model";
import { AuthStorage } from "features/session/model";
import axios from "axios";
import { LIBRARY_NAVIGATION_SETTING } from "../model/navigation";
import LibraryOrderDialog from "./LibraryOrderDialog";

vi.mock("axios", () => ({
  default: { post: vi.fn() },
}));
const libraries = [
  { key: "1", uuid: "movies", title: "Movies", type: "movie" as const },
  { key: "2", uuid: "music", title: "Music", type: "artist" as const },
];
let root: Root;
let host: HTMLDivElement;
let onClose: ReturnType<typeof vi.fn<() => void>>;
const switchInput = () =>
  document.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
async function save() {
  const button = [
    ...document.querySelectorAll<HTMLButtonElement>("button"),
  ].find((element) => element.textContent === "Save")!;
  await act(async () => button.click());
}
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.resetAllMocks();
  localStorage.clear();
  AuthStorage.saveActiveSession({
    profile: null,
    accountToken: "account",
    serverToken: "server",
  });
  useUserSettings.getState().reset();
  useUserSettings.setState({ profileKey: "owner:1", status: "ready" });
  vi.mocked(axios.post).mockResolvedValue(undefined);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  onClose = vi.fn();
  await act(async () =>
    root.render(
      <LibraryOrderDialog open libraries={libraries} onClose={onClose} />,
    ),
  );
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  useUserSettings.getState().reset();
  vi.unstubAllGlobals();
});

it("saves icon mode, library pins and order together", async () => {
  await act(async () => switchInput().click());
  await act(async () =>
    document
      .querySelector<HTMLButtonElement>('[aria-label="Unpin library"]')!
      .click(),
  );
  await save();
  expect(axios.post).toHaveBeenCalledTimes(1);
  expect(axios.post).toHaveBeenCalledWith(
    expect.stringMatching(/\/user\/options$/),
    {
      key: LIBRARY_NAVIGATION_SETTING,
      value: JSON.stringify({
        order: ["movies", "music"],
        pinned: ["music"],
        iconsOnly: true,
      }),
    },
    { headers: { "X-Plex-Token": "account" } },
  );
  expect(onClose).toHaveBeenCalledTimes(1);
});

it("retains the draft after an optimistic save is rolled back and allows retry", async () => {
  await act(async () => switchInput().click());
  vi.mocked(axios.post).mockRejectedValueOnce(new Error("Save failed"));
  await save();
  expect(onClose).not.toHaveBeenCalled();
  expect(document.body.textContent).toContain(
    "Library preferences could not be saved",
  );
  expect(switchInput().checked).toBe(true);
  expect(
    useUserSettings.getState().settings[LIBRARY_NAVIGATION_SETTING],
  ).toBeUndefined();
  await save();
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(axios.post).toHaveBeenCalledTimes(2);
});

it("resets the draft on a profile change and ignores a previous profile's late save", async () => {
  let finish!: () => void;
  vi.mocked(axios.post).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = () => resolve(undefined);
      }),
  );
  await act(async () => switchInput().click());
  await save();
  expect(switchInput().disabled).toBe(true);
  expect(
    document.querySelector<HTMLButtonElement>('[aria-label="Unpin library"]')!
      .disabled,
  ).toBe(true);
  await act(async () =>
    useUserSettings.setState({ profileKey: "owner:2", settings: {} }),
  );
  expect(switchInput().checked).toBe(false);
  expect(switchInput().disabled).toBe(false);
  await act(async () => finish());
  expect(onClose).not.toHaveBeenCalled();
});
