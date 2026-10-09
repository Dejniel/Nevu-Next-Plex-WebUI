import type { MediaMetadata } from "entities/media/model";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MusicProvider, useMusic } from "./MusicProvider";
import { serverQueryClient } from "shared/api/queryClient";
import type { MusicQueue } from "../api/music";
import {
  musicSessionKey,
  readMusicSession,
  saveMusicSession,
} from "./musicSession";
import { PlexRequestError } from "shared/api/PlexClient";
const mocks = vi.hoisted(() => ({
  scope: { serverId: "server", profileKey: "owner" },
  create: vi.fn(),
  get: vi.fn(),
  add: vi.fn(),
  remove: vi.fn(),
  move: vi.fn(),
  shuffle: vi.fn(),
  reset: vi.fn(),
  timeline: vi.fn(),
  playlistEntry: vi.fn(),
}));
vi.mock("features/session/model", () => ({
  useActiveServerScope: () => mocks.scope,
  useAuthSession: () => 1,
  getXPlexProps: () => ({ "X-Plex-Token": mocks.scope.profileKey }),
}));
vi.mock("entities/library/model", () => ({
  useLibraries: () => ({ data: [{ key: "3", uuid: "library-uuid" }] }),
}));
vi.mock("../api/music", () => ({ musicAPI: () => mocks }));
vi.mock("features/media-lists/model", () => ({
  getPlaylistEntry: mocks.playlistEntry,
}));
vi.mock("entities/media/model", () => ({
  mediaMetadataQueryOptions: (scope: unknown, id: string) => ({
    queryKey: ["test-metadata", scope, id],
    queryFn: async () => ({ ratingKey: id, type: "track", title: id }),
  }),
}));
const track = (id: number, entry: number) =>
  ({
    ratingKey: String(id),
    type: "track",
    title: String(id),
    playQueueItemID: entry,
  }) as MediaMetadata;
const queue: MusicQueue = {
  id: 10,
  version: 1,
  total: 3,
  selected: 100,
  selectedOffset: 0,
  shuffled: false,
  items: [track(1, 100), track(1, 101), track(2, 102)],
};
let root: Root, host: HTMLDivElement, controller: ReturnType<typeof useMusic>;
function Probe() {
  controller = useMusic();
  return (
    <span>
      {controller.session?.entryID}:{controller.track?.ratingKey}
    </span>
  );
}
beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.scope = { serverId: "server", profileKey: "owner" };
  mocks.create.mockReset();
  mocks.create.mockResolvedValue(queue);
  mocks.get.mockReset();
  mocks.get.mockResolvedValue(queue);
  mocks.shuffle.mockReset();
  mocks.shuffle.mockResolvedValue({ ...queue, shuffled: true });
  mocks.reset.mockReset();
  mocks.reset.mockResolvedValue(queue);
  mocks.remove.mockReset();
  mocks.timeline.mockReset();
  mocks.timeline.mockResolvedValue(undefined);
  mocks.playlistEntry.mockReset();
  mocks.playlistEntry.mockResolvedValue(track(1, 100));
  serverQueryClient.clear();
  host = document.createElement("div");
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  serverQueryClient.clear();
  vi.unstubAllGlobals();
});
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
}
it("plays duplicate queue entries separately and retains the track while browsing a different queue window", async () => {
  await act(async () =>
    root.render(
      <MusicProvider>
        <Probe />
      </MusicProvider>,
    ),
  );
  await act(async () => controller.play(track(1, 100)));
  await settle();
  expect(controller.session?.entryID).toBe(100);
  await act(async () => controller.step(1));
  expect(controller.session?.entryID).toBe(101);
  mocks.get.mockResolvedValue({ ...queue, items: [track(2, 102)] });
  await act(async () => controller.loadWindow(102));
  expect(controller.track?.ratingKey).toBe("1");
  expect(controller.session?.entryID).toBe(101);
});
it("does not publish a late queue after a profile switch", async () => {
  let resolve!: (queue: MusicQueue) => void;
  mocks.create.mockReturnValue(
    new Promise<MusicQueue>((done) => {
      resolve = done;
    }),
  );
  await act(async () =>
    root.render(
      <MusicProvider>
        <Probe />
      </MusicProvider>,
    ),
  );
  let pending!: Promise<void>;
  await act(async () => {
    pending = controller.play(track(1, 100));
  });
  const signal = mocks.create.mock.calls[0][3] as AbortSignal;
  mocks.scope = { serverId: "server", profileKey: "managed" };
  await act(async () =>
    root.render(
      <MusicProvider>
        <Probe />
      </MusicProvider>,
    ),
  );
  expect(signal.aborted).toBe(true);
  await act(async () => {
    resolve(queue);
    await pending;
  });
  expect(controller.session).toBeNull();
  expect(
    serverQueryClient.getQueryData(["music-queue", "server", "owner", 10]),
  ).toBeUndefined();
});

it("validates the selected playlist occurrence and creates an audio queue from the playlist instead of the album", async () => {
  await act(async () =>
    root.render(
      <MusicProvider>
        <Probe />
      </MusicProvider>,
    ),
  );
  const context = { id: "20", index: 8, itemID: "81" };
  await act(async () => controller.playPlaylist(context, track(1, 100)));
  expect(mocks.playlistEntry).toHaveBeenCalledWith(
    context,
    "1",
    expect.any(AbortSignal),
  );
  expect(mocks.create).toHaveBeenCalledWith(
    { kind: "playlist", id: "20" },
    "1",
    false,
    expect.any(AbortSignal),
  );
  expect(controller.session?.queueID).toBe(10);
  await act(async () => controller.playPlaylist(context, track(1, 100), true));
  expect(mocks.create).toHaveBeenLastCalledWith(
    { kind: "playlist", id: "20" },
    undefined,
    true,
    expect.any(AbortSignal),
  );
});

it("cancels a timeline read on Stop before it can continue into a queue mutation", async () => {
  await act(async () =>
    root.render(
      <MusicProvider>
        <Probe />
      </MusicProvider>,
    ),
  );
  await act(async () => controller.play(track(1, 100)));
  let finish!: () => void;
  mocks.timeline.mockReturnValue(
    new Promise<void>((resolve) => {
      finish = resolve;
    }),
  );
  let pending!: Promise<void>;
  await act(async () => {
    pending = controller.shuffle();
  });
  const signal = mocks.timeline.mock.calls[0][5] as AbortSignal;
  await act(async () => controller.stop());
  expect(signal.aborted).toBe(true);
  await act(async () => {
    finish();
    await pending;
  });
  expect(mocks.shuffle).not.toHaveBeenCalled();
  expect(controller.session).toBeNull();
});

it("keeps the playing queue when the saved playlist selection changed", async () => {
  await act(async () =>
    root.render(
      <MusicProvider>
        <Probe />
      </MusicProvider>,
    ),
  );
  await act(async () => controller.play(track(1, 100)));
  mocks.create.mockClear();
  mocks.playlistEntry.mockRejectedValue(
    new Error("This playlist has changed."),
  );
  await act(async () =>
    controller.playPlaylist({ id: "20", index: 8 }, track(1, 100)),
  );
  expect(mocks.create).not.toHaveBeenCalled();
  expect(controller.session?.entryID).toBe(100);
  expect(controller.error).toContain("playlist has changed");
});

it("does not create an old profile's queue after a late playlist validation", async () => {
  let resolve!: (item: MediaMetadata) => void;
  mocks.playlistEntry.mockReturnValue(
    new Promise<MediaMetadata>((done) => {
      resolve = done;
    }),
  );
  await act(async () =>
    root.render(
      <MusicProvider>
        <Probe />
      </MusicProvider>,
    ),
  );
  let pending!: Promise<void>;
  await act(async () => {
    pending = controller.playPlaylist({ id: "20", index: 0 }, track(1, 100));
  });
  mocks.scope = { serverId: "server", profileKey: "managed" };
  await act(async () =>
    root.render(
      <MusicProvider>
        <Probe />
      </MusicProvider>,
    ),
  );
  await act(async () => {
    resolve(track(1, 100));
    await pending;
  });
  expect(mocks.create).not.toHaveBeenCalled();
  expect(controller.session).toBeNull();
});

it("returns to the beginning through Plex after the last song in a bounded queue window", async () => {
  await act(async () =>
    root.render(
      <MusicProvider>
        <Probe />
      </MusicProvider>,
    ),
  );
  await act(async () => controller.play(track(1, 100)));
  await act(async () => controller.select(102));
  await act(async () => controller.setRepeat("all"));
  mocks.get.mockResolvedValue({ ...queue, total: 300, items: [track(2, 102)] });
  await act(async () => controller.step(1));
  expect(mocks.reset).toHaveBeenCalledWith(10, expect.any(AbortSignal));
  expect(controller.session?.entryID).toBe(100);
  expect(controller.session?.playing).toBe(true);
});

it("pauses at the end with repeat off and skips normally with repeat one", async () => {
  await act(async () =>
    root.render(
      <MusicProvider>
        <Probe />
      </MusicProvider>,
    ),
  );
  await act(async () => controller.play(track(1, 100)));
  await act(async () => controller.select(102));
  await act(async () => controller.step(1));
  expect(controller.session?.playing).toBe(false);
  expect(mocks.reset).not.toHaveBeenCalled();
  await act(async () => controller.select(100));
  await act(async () => controller.setRepeat("one"));
  await act(async () => controller.step(1));
  expect(controller.session?.entryID).toBe(101);
});

it("recenters navigation when the displayed window no longer contains the current entry", async () => {
  await act(async () =>
    root.render(
      <MusicProvider>
        <Probe />
      </MusicProvider>,
    ),
  );
  await act(async () => controller.play(track(1, 100)));
  mocks.get.mockResolvedValueOnce({ ...queue, items: [track(2, 102)] });
  await act(async () => controller.loadWindow(102));
  await act(async () => controller.step(1));
  expect(controller.session?.entryID).toBe(101);
  expect(mocks.get).toHaveBeenLastCalledWith(10, 100, expect.any(AbortSignal));
});

it("reports the active occurrence before shuffle and keeps playback and position across changed entry IDs", async () => {
  await act(async () =>
    root.render(
      <MusicProvider>
        <Probe />
      </MusicProvider>,
    ),
  );
  await act(async () => controller.play(track(1, 100)));
  await act(async () => controller.select(101));
  await settle();
  controller.rememberPosition(101, 23);
  const selectedSession = controller.session;
  mocks.shuffle.mockResolvedValue({
    ...queue,
    shuffled: true,
    selected: 101,
    items: [track(1, 101), track(2, 201), track(1, 202)],
  });
  await act(async () => controller.shuffle());
  expect(mocks.timeline).toHaveBeenCalledWith(
    expect.objectContaining({ playQueueItemID: 101 }),
    10,
    "playing",
    23,
    0,
    expect.any(AbortSignal),
  );
  expect(mocks.timeline.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.shuffle.mock.invocationCallOrder[0],
  );
  expect(mocks.shuffle).toHaveBeenCalledWith(10, true, expect.any(AbortSignal));
  expect(controller.session).toBe(selectedSession);
  expect(controller.queue?.shuffled).toBe(true);
  await act(async () => controller.shuffle());
  expect(mocks.shuffle).toHaveBeenLastCalledWith(
    10,
    false,
    expect.any(AbortSignal),
  );
});

it("selects the remaining native entry when the current occurrence is removed and clears an empty queue", async () => {
  await act(async () =>
    root.render(
      <MusicProvider>
        <Probe />
      </MusicProvider>,
    ),
  );
  await act(async () => controller.play(track(1, 100)));
  await settle();
  await act(async () => controller.pause());
  mocks.remove.mockResolvedValue({
    ...queue,
    total: 2,
    selected: 101,
    items: [track(1, 101), track(2, 102)],
  });
  await act(async () => controller.remove(100));
  expect(controller.session).toMatchObject({
    entryID: 101,
    playing: false,
    startTime: 0,
  });
  mocks.remove.mockResolvedValue({ ...queue, total: 0, items: [] });
  await act(async () => controller.remove(101));
  expect(controller.session).toBeNull();
});

it("restores the exact duplicate occurrence paused from a minimal scoped checkpoint", async () => {
  await act(async () =>
    root.render(
      <MusicProvider>
        <Probe />
      </MusicProvider>,
    ),
  );
  await act(async () => controller.play(track(1, 100)));
  await act(async () => controller.select(101));
  await act(async () => {
    controller.setRepeat("one");
    controller.setVolume(0.4);
  });
  controller.rememberPosition(100, 99); // A late event from the previous occurrence.
  controller.rememberPosition(101, 17);
  window.dispatchEvent(new PageTransitionEvent("pagehide"));
  const stored = JSON.parse(
    localStorage.getItem(musicSessionKey(mocks.scope))!,
  );
  expect(stored).toEqual({
    selection: { queueID: 10, entryID: 101, ratingKey: "1", position: 17 },
    repeat: "one",
    volume: 0.4,
  });
  await act(async () => root.render(null));
  serverQueryClient.clear();
  await act(async () =>
    root.render(
      <React.StrictMode>
        <MusicProvider>
          <Probe />
        </MusicProvider>
      </React.StrictMode>,
    ),
  );
  await settle();
  expect(mocks.create).toHaveBeenCalledTimes(1);
  expect(controller.session).toMatchObject({
    entryID: 101,
    startTime: 17,
    playing: false,
  });
  expect(controller.repeat).toBe("one");
  expect(controller.volume).toBe(0.4);
});

it.each(["missing queue", "missing entry"])(
  "discards a %s instead of recreating it from cached songs",
  async (scenario) => {
    saveMusicSession(musicSessionKey(mocks.scope), {
      selection: { queueID: 10, entryID: 101, ratingKey: "1", position: 17 },
      repeat: "off",
      volume: 1,
    });
    if (scenario === "missing queue")
      mocks.get.mockRejectedValue(new PlexRequestError(404, null));
    else
      mocks.get.mockResolvedValue({
        ...queue,
        items: [track(1, 100), track(2, 102)],
      });
    await act(async () =>
      root.render(
        <MusicProvider>
          <Probe />
        </MusicProvider>,
      ),
    );
    await settle();
    expect(controller.session).toBeNull();
    expect(controller.error).toBeFalsy();
    expect(mocks.create).not.toHaveBeenCalled();
    expect(readMusicSession(musicSessionKey(mocks.scope)).selection).toBeNull();
  },
);

it("aborts restoration without blocking new playback or accepting the late response", async () => {
  saveMusicSession(musicSessionKey(mocks.scope), {
    selection: { queueID: 11, entryID: 101, ratingKey: "1", position: 17 },
    repeat: "off",
    volume: 1,
  });
  let complete!: (queue: MusicQueue) => void;
  mocks.get.mockReturnValueOnce(
    new Promise((resolve) => {
      complete = resolve;
    }),
  );
  await act(async () =>
    root.render(
      <MusicProvider>
        <Probe />
      </MusicProvider>,
    ),
  );
  const signal = mocks.get.mock.lastCall![2] as AbortSignal;
  await act(async () => controller.stop());
  expect(signal.aborted).toBe(true);
  await act(async () => controller.play(track(1, 100)));
  await act(async () => complete({ ...queue, id: 11 }));
  expect(controller.session?.queueID).toBe(10);
  expect(controller.busy).toBe(false);
  expect(
    serverQueryClient.getQueryData(["music-queue", "server", "owner", 11]),
  ).toBeUndefined();
});
