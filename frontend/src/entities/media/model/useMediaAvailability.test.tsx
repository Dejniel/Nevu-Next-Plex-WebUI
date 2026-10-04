import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { invalidateLibraryCache } from "shared/lib/libraryCache";
import { getLocalMediaMatches } from "../api/mediaAvailability";
import { useMediaAvailability } from "./useMediaAvailability";

jest.mock("../api/mediaAvailability", () => ({
  getLocalMediaMatches: jest.fn(),
}));
const lookup = getLocalMediaMatches as jest.Mock;
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
  jest.resetAllMocks();
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  guids = ["one"];
  profile = "owner:1";
  element = document.createElement("div");
  root = createRoot(element);
  lookup.mockResolvedValue([movie]);
});
afterEach(async () => {
  await act(async () => root.unmount());
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

it("surfaces failures, retries and refreshes after library invalidation", async () => {
  lookup.mockRejectedValueOnce(new Error("offline"));
  await render();
  expect(state.error).toBeTruthy();
  expect(state.loading).toBe(false);
  await act(async () => state.retry());
  expect(state.error).toBeNull();
  expect(state.items.has("one")).toBe(true);
  await act(async () => invalidateLibraryCache());
  expect(lookup).toHaveBeenCalledTimes(3);
});

it("does not request data or keep loading without an active profile", async () => {
  profile = null;
  await render();
  expect(lookup).not.toHaveBeenCalled();
  expect(state.loading).toBe(false);
});
