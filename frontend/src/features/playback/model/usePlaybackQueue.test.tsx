import type { MediaMetadata } from "entities/media/model";
import type { Mock } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  getPlaylistQueue,
  type PlaylistPlaybackContext,
} from "features/media-lists/model";
import { getPlaybackQueueForItem } from "../api/playback";
import { usePlaybackQueue } from "./usePlaybackQueue";
import { useAuthSession, useServerSession } from "features/session/model";

vi.mock("features/media-lists/model", () => ({
  getPlaylistQueue: vi.fn(),
}));
vi.mock("../api/playback", () => ({ getPlaybackQueueForItem: vi.fn() }));
const playlistLookup = getPlaylistQueue as Mock;
const defaultLookup = getPlaybackQueueForItem as Mock;
const movie = { ratingKey: "1", type: "movie" } as MediaMetadata;
let root: Root;
let playlist: PlaylistPlaybackContext | undefined;
let metadata: MediaMetadata;
let state: ReturnType<typeof usePlaybackQueue>;
function Harness() {
  state = usePlaybackQueue(metadata, playlist);
  return null;
}
async function render() {
  await act(async () => root.render(<Harness />));
}

beforeEach(() => {
  vi.resetAllMocks();
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  root = createRoot(document.createElement("div"));
  playlist = { id: "20", index: 0 };
  metadata = movie;
  useAuthSession.setState({ ownerUser: { id: 1 } as Plex.UserData, activeProfile: { id: 1 } as never });
  useServerSession.setState({ server: { machineIdentifier: "server" } as Plex.ServerPreferences });
  playlistLookup.mockResolvedValue([movie]);
  defaultLookup.mockResolvedValue([movie]);
});
afterEach(async () => {
  await act(async () => root.unmount());
});

it("uses the playlist adapter and keeps regular episode queues unchanged", async () => {
  await render();
  expect(playlistLookup).toHaveBeenCalledWith(playlist, "1", expect.any(AbortSignal));
  expect(defaultLookup).not.toHaveBeenCalled();
  playlist = undefined;
  await render();
  expect(defaultLookup).toHaveBeenCalledWith(movie.ratingKey, expect.any(AbortSignal));
});

it("ignores a late queue for a different occurrence of the same movie", async () => {
  let resolveOld!: (queue: MediaMetadata[]) => void;
  playlistLookup.mockReturnValueOnce(
    new Promise((resolve) => {
      resolveOld = resolve;
    }),
  );
  await render();
  playlist = { id: "20", index: 3 };
  const next = { ratingKey: "new" } as MediaMetadata;
  playlistLookup.mockResolvedValueOnce([movie, next]);
  await render();
  await act(async () =>
    resolveOld([movie, { ratingKey: "old" } as MediaMetadata]),
  );
  expect(state.playQueue?.[1]).toBe(next);
});

it("surfaces a playlist failure and retries without falling back to the show's queue", async () => {
  playlistLookup.mockRejectedValueOnce(new Error("changed"));
  await render();
  expect(state.queueError).toBe("changed");
  expect(state.playQueue).toBeNull();
  await act(async () => state.reloadQueue());
  expect(state.queueError).toBeNull();
  expect(state.playQueue).toEqual([movie]);
  expect(defaultLookup).not.toHaveBeenCalled();
});

it("ignores the previous occurrence when its ID changes at the same position", async () => {
  let resolveOld!: (queue: MediaMetadata[]) => void;
  playlist = { id: "20", index: 0, itemID: "80" };
  playlistLookup.mockReturnValueOnce(
    new Promise((resolve) => {
      resolveOld = resolve;
    }),
  );
  await render();
  playlist = { ...playlist, itemID: "81" };
  const next = { ratingKey: "new" } as MediaMetadata;
  playlistLookup.mockResolvedValueOnce([movie, next]);
  await render();
  await act(async () => resolveOld([movie]));
  expect(playlistLookup).toHaveBeenCalledTimes(2);
  expect(state.playQueue?.[1]).toBe(next);
});

it("clears playback queues when the profile disappears and ignores the late response", async () => {
  let resolveOld!: (queue: MediaMetadata[]) => void;
  playlistLookup.mockReturnValueOnce(
    new Promise((resolve) => {
      resolveOld = resolve;
    }),
  );
  await render();
  await act(async () => useAuthSession.setState({ ownerUser: null }));
  await act(async () => resolveOld([movie]));
  expect(state.playQueue).toBeNull();
  expect(state.queueError).toBeNull();
  expect(playlistLookup).toHaveBeenCalledTimes(1);
});

it("surfaces and retries a regular queue failure without losing the current movie", async () => {
  playlist = undefined;
  defaultLookup.mockRejectedValueOnce(new Error("HTTP 503"));
  await render();
  expect(state.queueError).toBe("HTTP 503");
  expect(state.playQueue).toBeNull();
  await act(async () => state.reloadQueue());
  expect(state.queueError).toBeNull();
  expect(state.playQueue).toEqual([movie]);
});

it("cancels the previous queue when the server changes", async () => {
  playlistLookup.mockReturnValueOnce(new Promise(() => {}));
  await render();
  const previous = playlistLookup.mock.calls[0][2] as AbortSignal;
  await act(async () => useServerSession.setState({ server: { machineIdentifier: "other" } as Plex.ServerPreferences }));
  expect(previous.aborted).toBe(true);
  expect(playlistLookup).toHaveBeenCalledTimes(2);
  expect(state.playQueue).toEqual([movie]);
});

it("keeps the queue when stream selection refreshes metadata for the same item", async () => {
  playlist = undefined;
  await render();
  metadata = { ...movie, Media: [] };
  await render();
  expect(defaultLookup).toHaveBeenCalledTimes(1);
  expect(state.playQueue).toEqual([movie]);
});
