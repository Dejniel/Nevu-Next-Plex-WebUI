import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  getPlaylistQueue,
  type PlaylistPlaybackContext,
} from "features/media-lists/model";
import { getPlaybackQueueForItem } from "../api/playback";
import { usePlaybackQueue } from "./usePlaybackQueue";

jest.mock("features/media-lists/model", () => ({
  getPlaylistQueue: jest.fn(),
}));
jest.mock("../api/playback", () => ({ getPlaybackQueueForItem: jest.fn() }));
const playlistLookup = getPlaylistQueue as jest.Mock;
const defaultLookup = getPlaybackQueueForItem as jest.Mock;
const movie = { ratingKey: "1", type: "movie" } as Plex.Metadata;
let root: Root;
let playlist: PlaylistPlaybackContext | undefined;
let state: ReturnType<typeof usePlaybackQueue>;
function Harness() {
  state = usePlaybackQueue(movie, playlist);
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
  root = createRoot(document.createElement("div"));
  playlist = { id: "20", index: 0 };
  playlistLookup.mockResolvedValue([movie]);
  defaultLookup.mockResolvedValue([movie]);
});
afterEach(async () => {
  await act(async () => root.unmount());
});

it("uses the playlist adapter and keeps regular episode queues unchanged", async () => {
  await render();
  expect(playlistLookup).toHaveBeenCalledWith(playlist, "1");
  expect(defaultLookup).not.toHaveBeenCalled();
  playlist = undefined;
  await render();
  expect(defaultLookup).toHaveBeenCalledWith(movie);
});

it("ignores a late queue for a different occurrence of the same movie", async () => {
  let resolveOld!: (queue: Plex.Metadata[]) => void;
  playlistLookup.mockReturnValueOnce(
    new Promise((resolve) => {
      resolveOld = resolve;
    }),
  );
  await render();
  playlist = { id: "20", index: 3 };
  const next = { ratingKey: "new" } as Plex.Metadata;
  playlistLookup.mockResolvedValueOnce([movie, next]);
  await render();
  await act(async () =>
    resolveOld([movie, { ratingKey: "old" } as Plex.Metadata]),
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
