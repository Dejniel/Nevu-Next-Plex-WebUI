import type { Mock } from "vitest";
import { notifyManager } from "@tanstack/react-query";
import { serverQueryClient } from "shared/api/queryClient";
beforeAll(() => notifyManager.setScheduler(queueMicrotask));
afterAll(() => notifyManager.setScheduler((callback) => setTimeout(callback, 0)));
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useServerSession } from "features/session/model";
import { applyAvailabilityChanges } from "./availabilitySync";
import { getLocalMediaMatches } from "../api/mediaAvailability";
import { useMediaAvailability } from "./useMediaAvailability";

vi.mock("../api/mediaAvailability", () => ({
  getLocalMediaMatches: vi.fn(),
}));
const lookup = getLocalMediaMatches as Mock;
const movie = {
  guid: "one",
  ratingKey: "1",
  librarySectionID: 1,
} as Plex.Metadata;
let root: Root;
let element: HTMLDivElement;
let guids: string[];
let profile: string | null;
let state: ReturnType<typeof useMediaAvailability>;
function Harness() {
  state = useMediaAvailability(guids, profile);
  return null;
}
async function render() {
  await act(async () => root.render(<Harness />));
}

beforeEach(() => {
  vi.resetAllMocks();
  serverQueryClient.clear();
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  guids = ["one"];
  profile = "owner:1";
  useServerSession.setState({ server: { machineIdentifier: "server" } as Plex.ServerPreferences });
  element = document.createElement("div");
  root = createRoot(element);
  lookup.mockResolvedValue([movie]);
});
afterEach(async () => {
  await act(async () => root.unmount());
  serverQueryClient.clear();
  vi.useRealTimers();
});

it("reuses availability when a caller only reorders the same GUIDs", async () => {
  guids = ["one", "two", "one"];
  await render();
  guids = ["two", "one"];
  await render();
  expect(lookup).toHaveBeenCalledTimes(1);
  expect(state.items.get("one")?.localItems).toEqual([movie]);
});

it("ignores responses after changing the active profile", async () => {
  let resolveOld!: (items: Plex.Metadata[]) => void;
  lookup.mockReturnValueOnce(
    new Promise((resolve) => {
      resolveOld = resolve;
    }),
  );
  await render();
  const signal = lookup.mock.calls[0][1] as AbortSignal;
  profile = "owner:2";
  lookup.mockResolvedValueOnce([]);
  await render();
  expect(signal.aborted).toBe(true);
  await act(async () => resolveOld([movie]));
  expect(state.items.size).toBe(0);
});

it("ignores an earlier list's response after changing items", async () => {
  let resolveOld!: (items: Plex.Metadata[]) => void;
  lookup.mockReturnValueOnce(
    new Promise((resolve) => {
      resolveOld = resolve;
    }),
  );
  await render();
  guids = ["two"];
  lookup.mockResolvedValueOnce([{ ...movie, guid: "two", ratingKey: "2" }]);
  await render();
  await act(async () => resolveOld([movie]));
  expect([...state.items.keys()]).toEqual(["two"]);
});

it("surfaces failures, retries and refreshes after a scoped recovery", async () => {
  lookup.mockRejectedValueOnce(new Error("offline"));
  await render();
  expect(state.error).toBeTruthy();
  expect(state.loading).toBe(false);
  await act(async () => state.retry());
  expect(state.error).toBeNull();
  expect(state.items.has("one")).toBe(true);
  await act(async () => {
    await applyAvailabilityChanges(serverQueryClient, [{ change: {
      serverId: "server", profileKey: "owner:1", kind: "recovery",
    } }]);
  });
  expect(lookup).toHaveBeenCalledTimes(3);
});

it("does not request data or keep loading without an active profile", async () => {
  profile = null;
  await render();
  expect(lookup).not.toHaveBeenCalled();
  expect(state.loading).toBe(false);
});

it("keeps checked availability through background loading and a failed retry", async () => {
  await render();
  let reject!: (error: Error) => void;
  lookup.mockReturnValueOnce(
    new Promise((_resolve, failure) => {
      reject = failure;
    }),
  );
  await act(async () => state.retry());
  expect(state.loading).toBe(false);
  expect(state.items.get("one")?.localItems).toEqual([movie]);
  await act(async () => reject(new Error("offline")));
  expect(state.error).toBeTruthy();
  expect(state.items.get("one")?.localItems).toEqual([movie]);
});

it("refreshes unchanged GUIDs on the visible interval and ignores another profile's invalidation", async () => {
  vi.useFakeTimers();
  await render();
  await act(async () => {
    await applyAvailabilityChanges(serverQueryClient, [{ change: {
      serverId: "server", profileKey: "owner:2", kind: "recovery",
    } }]);
  });
  expect(lookup).toHaveBeenCalledTimes(1);
  lookup.mockResolvedValueOnce([]);
  await act(async () => vi.advanceTimersByTime(60_000));
  expect(lookup).toHaveBeenCalledTimes(2);
  expect(state.items.size).toBe(0);
  vi.useRealTimers();
});
