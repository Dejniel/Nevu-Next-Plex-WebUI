import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { notifyManager } from "@tanstack/react-query";
import {
  AuthStorage,
  useAuthSession,
  useServerSession,
} from "features/session/model";
import { serverQueryClient } from "shared/api/queryClient";
import { createShare, deleteShare, updateShare } from "../api/sharing";
import type { PlexShare } from "../api/sharing";
import ShareEditor from "./ShareEditor";

vi.mock("../api/sharing", () => ({
  createShare: vi.fn(),
  updateShare: vi.fn(),
  deleteShare: vi.fn(),
}));
const recipient = { id: 2, title: "Child" };
const libraries = [{ id: "1", title: "Movies", type: "movie" }];
const share: PlexShare = {
  id: 42,
  userId: 2,
  displayName: "Child",
  account: null,
  home: true,
  status: "active",
  librarySectionIds: ["1"],
  allLibraries: false,
  allowDownloads: false,
};
let root: Root;
let host: HTMLDivElement;
const saved = vi.fn();
beforeAll(() => notifyManager.setScheduler(queueMicrotask));
afterAll(() =>
  notifyManager.setScheduler((callback) => setTimeout(callback, 0)),
);
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  useAuthSession.setState({ status: "ready", revision: 1 });
  AuthStorage.saveActiveSession({
    profile: null,
    accountToken: "account",
    serverToken: "server",
  });
  useServerSession.setState({
    server: { machineIdentifier: "local" } as Plex.ServerPreferences,
  });
  serverQueryClient.clear();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  serverQueryClient.clear();
  vi.unstubAllGlobals();
});
async function render(current: PlexShare | null) {
  await act(async () =>
    root.render(
      <ShareEditor
        open
        recipient={recipient}
        share={current}
        libraries={libraries}
        onClose={vi.fn()}
        onSaved={saved}
      />,
    ),
  );
}
async function click(label: string) {
  const element = Array.from(document.querySelectorAll("button,label")).find(
    (element) => element.textContent === label,
  )!;
  await act(async () => (element as HTMLElement).click());
}

it("grants selected libraries to the managed profile without asking for an email", async () => {
  await render(null);
  expect(document.querySelector('input[type="text"]')).toBeNull();
  await click("Movies");
  await click("Save");
  expect(createShare).toHaveBeenCalledWith(
    { invitedId: 2, librarySectionIds: ["1"], allowDownloads: true },
    expect.any(AbortSignal),
  );
  expect(saved).toHaveBeenCalled();
});

it("removes server access when all of the existing share's libraries are deselected", async () => {
  await render(share);
  await click("Movies");
  await click("Save");
  expect(deleteShare).toHaveBeenCalledWith(42, expect.any(AbortSignal));
  expect(updateShare).not.toHaveBeenCalled();
});

it("aborts a library access write and ignores success after switching profile", async () => {
  let finish!: () => void;
  vi.mocked(updateShare).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await render(share);
  await click("Save");
  const signal = vi.mocked(updateShare).mock.calls[0][2]!;
  await act(async () => useAuthSession.setState({ revision: 2 }));
  expect(signal.aborted).toBe(true);
  await act(async () => finish());
  expect(saved).not.toHaveBeenCalled();
});

it("keeps an unsaved draft when the same recipient's sharing data refreshes", async () => {
  await render(share);
  await click("Movies");
  await act(async () =>
    root.render(
      <ShareEditor
        open
        recipient={{ ...recipient }}
        share={{ ...share }}
        libraries={[...libraries]}
        onClose={vi.fn()}
        onSaved={saved}
      />,
    ),
  );
  expect(
    document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked,
  ).toBe(false);
  await click("Save");
  expect(deleteShare).toHaveBeenCalledWith(42, expect.any(AbortSignal));
});
