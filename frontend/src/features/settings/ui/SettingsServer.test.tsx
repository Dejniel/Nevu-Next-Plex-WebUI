import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { notifyManager } from "@tanstack/react-query";
import { normalizePlexPreferences } from "@nevu/contracts";
import {
  AuthStorage,
  useAuthSession,
  useServerSession,
} from "features/session/model";
import { serverQueryClient } from "shared/api/queryClient";
import {
  getServerPreferences,
  updateServerPreferences,
} from "../api/serverPreferences";
import SettingsServer from "./SettingsServer";

vi.mock("../api/serverPreferences", () => ({
  getServerPreferences: vi.fn(),
  updateServerPreferences: vi.fn(),
}));
const initial = normalizePlexPreferences([
  {
    id: "FriendlyName",
    label: "Friendly name",
    type: "text",
    value: "Test",
    default: "",
    group: "general",
  },
  {
    id: "enabled",
    label: "Discovery",
    summary: "Discover this server.",
    type: "bool",
    value: true,
    default: false,
    group: "network",
    advanced: true,
  },
  {
    id: "ratio",
    label: "Ratio",
    type: "double",
    value: 0.75,
    default: 0.5,
    group: "transcoder",
  },
  {
    id: "language",
    label: "Language",
    type: "text",
    value: "",
    default: "",
    enumValues: ":Account default|pl:Polish",
    group: "general",
  },
]);
let root: Root;
let host: HTMLDivElement;
async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
}
function button(text: string) {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (element) => element.textContent === text,
  )!;
}
function field(label: string) {
  const element = [
    ...document.querySelectorAll<HTMLLabelElement>("label"),
  ].find(
    (element) => element.textContent?.replace(/\s+/g, " ").trim() === label,
  )!;
  return document.getElementById(element.htmlFor) as HTMLInputElement;
}
async function fill(label: string, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(field(label), value);
    field(label).dispatchEvent(new Event("input", { bubbles: true }));
  });
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
    refresh: vi.fn().mockResolvedValue(undefined),
  });
  vi.mocked(getServerPreferences).mockResolvedValue(initial);
  vi.mocked(updateServerPreferences).mockImplementation(
    async (_token, changes) => {
      vi.mocked(getServerPreferences).mockResolvedValue(
        initial.map((setting) => ({
          ...setting,
          value: changes[setting.id] ?? setting.value,
        })),
      );
      return changes;
    },
  );
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<SettingsServer />));
  await flush();
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  serverQueryClient.clear();
  vi.unstubAllGlobals();
});

it("groups fields, hides advanced settings and displays empty enum values", async () => {
  expect(host.textContent).toContain("Transcoder");
  expect(host.textContent).toContain("Account default");
  expect(host.textContent).not.toContain("Discover this server.");
  await act(async () =>
    document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click(),
  );
  expect(host.textContent).toContain("Discover this server.");
});

it("saves only edits and keeps them visible when search hides their fields", async () => {
  await fill("Friendly name", "New server");
  await fill("Search settings", "Ratio");
  expect(host.textContent).not.toContain("Friendly name");
  expect(host.textContent).toContain("1 unsaved change");
  await act(async () => button("Save changes").click());
  await flush();
  expect(updateServerPreferences).toHaveBeenCalledWith(
    "account",
    { FriendlyName: "New server" },
    expect.any(AbortSignal),
  );
  expect(host.textContent).toContain("No unsaved changes");
});

it("restores individual defaults and discards the local draft", async () => {
  await act(async () =>
    document
      .querySelector<HTMLButtonElement>(
        '[aria-label="Restore default for Ratio"]',
      )!
      .click(),
  );
  expect(field("Ratio").value).toBe("0.5");
  await act(async () => button("Discard").click());
  expect(field("Ratio").value).toBe("0.75");
  expect(updateServerPreferences).not.toHaveBeenCalled();
});

it("keeps a failed save editable for retry", async () => {
  await fill("Friendly name", "Unsaved");
  vi.mocked(updateServerPreferences).mockRejectedValueOnce(
    new Error("Plex refused the save"),
  );
  await act(async () => button("Save changes").click());
  await flush();
  expect(field("Friendly name").value).toBe("Unsaved");
  expect(host.textContent).toContain("Plex refused the save");
  expect(button("Save changes").disabled).toBe(false);
});

it("does not read preferences for a profile without manage permission", async () => {
  await act(async () => useServerSession.setState({ canManageServer: false }));
  vi.mocked(getServerPreferences).mockClear();
  await act(async () => root.render(<SettingsServer key="new" />));
  await flush();
  expect(getServerPreferences).not.toHaveBeenCalled();
  expect(host.textContent).toContain("cannot manage this server");
});
