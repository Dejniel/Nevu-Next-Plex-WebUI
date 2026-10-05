import type { Mock } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  releaseMediaPlayback,
  resolveMediaPlayback,
} from "../api/mediaPlayback";
import { useMediaPlaybackSource } from "./useMediaPlaybackSource";
import type { PlexPlaybackSource } from "./mediaPlayback";

vi.mock("../api/mediaPlayback", () => ({
  resolveMediaPlayback: vi.fn(),
  releaseMediaPlayback: vi.fn(),
}));
let root: Root;
let element: HTMLDivElement;
let metadata: Plex.Metadata | null;
let state: ReturnType<typeof useMediaPlaybackSource>;
const source: PlexPlaybackSource = {
  id: "first",
  url: "/stream.mpd",
  type: "dash",
  mode: "remux",
  sessionID: "session-1",
};
function Harness() {
  state = useMediaPlaybackSource(metadata);
  return null;
}
const render = () =>
  act(async () => {
    root.render(<Harness />);
  });

beforeEach(() => {
  vi.resetAllMocks();
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  element = document.createElement("div");
  root = createRoot(element);
  metadata = { ratingKey: "1" } as Plex.Metadata;
  (resolveMediaPlayback as Mock).mockResolvedValue(source);
});
afterEach(async () => {
  await act(async () => root.unmount());
});

it("releases the old Plex session when the item changes", async () => {
  await render();
  metadata = { ratingKey: "2" } as Plex.Metadata;
  await render();
  expect(releaseMediaPlayback).toHaveBeenCalledWith(source);
  expect(resolveMediaPlayback).toHaveBeenCalledTimes(2);
});

it("discards and releases a session that resolves after the item changes", async () => {
  let complete!: (source: PlexPlaybackSource) => void;
  (resolveMediaPlayback as Mock).mockReturnValueOnce(
    new Promise((resolve) => {
      complete = resolve;
    }),
  );
  await render();
  metadata = { ratingKey: "2" } as Plex.Metadata;
  const second = { ...source, id: "second", sessionID: "session-2" };
  (resolveMediaPlayback as Mock).mockResolvedValue(second);
  await render();
  await act(async () => complete(source));
  expect(state.source).toBe(second);
  expect(releaseMediaPlayback).toHaveBeenCalledWith(source);
});

it("releases the Plex session when unmounted during negotiation", async () => {
  let complete!: (source: PlexPlaybackSource) => void;
  (resolveMediaPlayback as Mock).mockReturnValue(
    new Promise((resolve) => {
      complete = resolve;
    }),
  );
  await render();
  await act(async () => root.unmount());
  await act(async () => complete(source));
  expect(releaseMediaPlayback).toHaveBeenCalledWith(source);
});

it("allows one compatible fallback for a decoder failure", async () => {
  await render();
  await act(async () => {
    expect(state.recover({ kind: "media", message: "decode" })).toBe(true);
  });
  expect(resolveMediaPlayback).toHaveBeenLastCalledWith(
    metadata,
    {},
    undefined,
    true,
  );
  expect(state.recover({ kind: "media", message: "decode" })).toBe(false);
});

it("does not convert media because of a network error", async () => {
  await render();
  expect(state.recover({ kind: "network", message: "offline" })).toBe(false);
  expect(resolveMediaPlayback).toHaveBeenCalledTimes(1);
});

it("can explicitly retry failed negotiation", async () => {
  (resolveMediaPlayback as Mock).mockRejectedValueOnce(
    new Error("Plex unavailable"),
  );
  await render();
  expect(state.error).toBe("Plex unavailable");
  await act(async () => state.reload());
  expect(state.error).toBeNull();
  expect(state.source).toBe(source);
});

it("stops its session on a real page unload and removes the listener on unmount", async () => {
  await render();
  window.dispatchEvent(
    new PageTransitionEvent("pagehide", { persisted: false }),
  );
  expect(releaseMediaPlayback).toHaveBeenCalledWith(source, true);
  await act(async () => root.unmount());
  (releaseMediaPlayback as Mock).mockClear();
  window.dispatchEvent(
    new PageTransitionEvent("pagehide", { persisted: false }),
  );
  expect(releaseMediaPlayback).not.toHaveBeenCalled();
});
