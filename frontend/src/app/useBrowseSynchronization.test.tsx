import type { Mock } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  connectPlexServerEvents,
  type PlexServerChange,
} from "features/session/model";
import { invalidateMediaLists } from "features/media-lists/model";
import { invalidateLibraryCache } from "shared/lib/libraryCache";
import { useBrowseSynchronization } from "./useBrowseSynchronization";

let mockProfile: string | null;
vi.mock("features/settings/model", () => ({
  useUserSettings: Object.assign(
    (select: (state: { profileKey: string | null }) => unknown) =>
      select({ profileKey: mockProfile }),
    { getState: () => ({ profileKey: mockProfile }) },
  ),
}));
vi.mock("features/session/model", () => ({
  AuthStorage: { getServerToken: () => "test-token" },
  connectPlexServerEvents: vi.fn(),
}));
vi.mock("features/media-lists/model", () => ({
  invalidateMediaLists: vi.fn(),
}));
vi.mock("shared/lib/libraryCache", () => ({
  invalidateLibraryCache: vi.fn(),
}));
let root: Root;
const connect = connectPlexServerEvents as Mock;
const close = vi.fn();
function Harness() {
  useBrowseSynchronization(0);
  return null;
}
const render = async () => {
  await act(async () => root.render(<Harness />));
};
beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  vi.resetAllMocks();
  mockProfile = "owner:1";
  connect.mockReturnValue(close);
  root = createRoot(document.createElement("div"));
});
afterEach(async () => {
  await act(async () => root.unmount());
});

it("routes section changes to that section's collections and availability, including cross-library smart playlists", async () => {
  await render();
  const changed = connect.mock.calls[0][1] as (
    change: PlexServerChange,
  ) => void;
  changed({ kind: "library", sectionId: "2" });
  expect(invalidateLibraryCache).toHaveBeenCalledWith({
    profileKey: "owner:1",
    sectionId: "2",
  });
  expect(invalidateMediaLists).toHaveBeenCalledWith({
    profileKey: "owner:1",
    kind: "collection",
    libraryID: "2",
  });
  expect(invalidateMediaLists).toHaveBeenCalledWith({
    profileKey: "owner:1",
    kind: "playlist",
  });
});

it("targets individual lists and closes the old profile's stream before accepting another profile", async () => {
  await render();
  const old = connect.mock.calls[0][1] as (change: PlexServerChange) => void;
  old({ kind: "playlist", id: "8" });
  expect(invalidateMediaLists).toHaveBeenLastCalledWith({
    profileKey: "owner:1",
    kind: "playlist",
    id: "8",
    libraryID: undefined,
  });
  expect(invalidateLibraryCache).not.toHaveBeenCalled();
  mockProfile = "owner:2";
  await render();
  expect(close).toHaveBeenCalledTimes(1);
  (invalidateMediaLists as Mock).mockClear();
  old({ kind: "server", reason: "reconnect" });
  expect(invalidateMediaLists).not.toHaveBeenCalled();
  const current = connect.mock.calls[1][1] as (
    change: PlexServerChange,
  ) => void;
  current({ kind: "server", reason: "reconnect" });
  expect(invalidateLibraryCache).toHaveBeenLastCalledWith({
    profileKey: "owner:2",
    sectionId: undefined,
  });
  expect(invalidateMediaLists).toHaveBeenCalledTimes(2);
});

it("does not connect without an active profile", async () => {
  mockProfile = null;
  await render();
  expect(connect).not.toHaveBeenCalled();
});
