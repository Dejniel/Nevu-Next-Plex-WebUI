import type { MediaMetadata } from "entities/media/model";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  shouldIgnorePlaybackShortcut,
  usePlaybackCommands,
} from "./usePlaybackCommands";

it("ignores playback shortcuts from editable controls", () => {
  const input = document.createElement("input");
  const editable = document.createElement("div");
  editable.setAttribute("contenteditable", "true");
  const nested = document.createElement("span");
  editable.appendChild(nested);

  expect(shouldIgnorePlaybackShortcut(input)).toBe(true);
  expect(shouldIgnorePlaybackShortcut(nested)).toBe(true);
  expect(shouldIgnorePlaybackShortcut(document.body)).toBe(false);
  expect(shouldIgnorePlaybackShortcut(null)).toBe(false);
});

describe("playlist playback commands", () => {
  let root: Root;
  let options: Parameters<typeof usePlaybackCommands>[0];
  let commands: ReturnType<typeof usePlaybackCommands>;
  const movie = {
    type: "movie",
    ratingKey: "10",
    librarySectionID: 2,
  } as MediaMetadata;
  function Harness() {
    commands = usePlaybackCommands(options);
    return null;
  }
  async function render() {
    await act(async () => root.render(React.createElement(Harness)));
  }
  beforeEach(() => {
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    root = createRoot(document.createElement("div"));
    options = {
      metadata: movie,
      playQueue: [movie, { ...movie, ratingKey: "11" }],
      playlistContext: { id: "30", index: 0, libraryID: "2" },
      isGuest: false,
      runtime: {
        getDuration: () => 100,
        seekToLocal: vi.fn(),
      } as unknown as Parameters<typeof usePlaybackCommands>[0]["runtime"],
      sync: {
        pause: vi.fn(),
        resume: vi.fn(),
        seek: vi.fn(),
        end: vi.fn(),
        leave: vi.fn(),
      },
      navigate: vi.fn(),
      reportStopped: vi.fn().mockResolvedValue(undefined),
      getSurface: () => null,
    };
  });
  afterEach(async () => {
    await act(async () => root.unmount());
  });

  it("advances films on completion and ends the session at the last playlist item", async () => {
    await render();
    commands.handleEnded();
    expect(options.navigate).toHaveBeenCalledWith(
      "/watch/11?playlist=30&position=1&fromLibrary=2",
    );
    expect(options.sync.end).not.toHaveBeenCalled();
    options = { ...options, playQueue: [movie] };
    await render();
    commands.handleEnded();
    expect(options.navigate).toHaveBeenLastCalledWith(
      "/browse/2?list=30&view=playlists",
    );
    expect(options.sync.end).toHaveBeenCalledTimes(1);
  });

  it("waits for playlist order and leaves advancement to the host for guests", async () => {
    options.playQueue = null;
    await render();
    commands.handleEnded();
    expect(options.navigate).not.toHaveBeenCalled();
    options = { ...options, isGuest: true, playQueue: [movie, movie] };
    await render();
    commands.handleEnded();
    expect(options.navigate).not.toHaveBeenCalled();
  });

  it("returns to the playlist even when the media could not be loaded", async () => {
    options.metadata = null;
    await render();
    commands.exitPlayback();
    expect(options.navigate).toHaveBeenCalledWith(
      "/browse/2?list=30&view=playlists",
    );
    expect(options.reportStopped).toHaveBeenCalledTimes(1);
    expect(options.sync.leave).toHaveBeenCalledTimes(1);
  });

  it("advances when a previously failed or delayed playlist queue becomes ready after the film ended", async () => {
    options.playQueue = null;
    await render();
    commands.handleEnded();
    expect(options.navigate).not.toHaveBeenCalled();
    options = { ...options, playQueue: [movie, { ...movie, ratingKey: "11" }] };
    await render();
    expect(options.navigate).toHaveBeenCalledTimes(1);
    expect(options.navigate).toHaveBeenCalledWith(
      "/watch/11?playlist=30&position=1&fromLibrary=2",
    );
  });

  it("does not advance an ended item after seeking back while its queue is loading", async () => {
    options.playQueue = null;
    await render();
    commands.handleEnded();
    commands.seekTo(10);
    options = { ...options, playQueue: [movie, movie] };
    await render();
    expect(options.navigate).not.toHaveBeenCalled();
  });
});
