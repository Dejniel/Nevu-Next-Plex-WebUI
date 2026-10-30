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

describe("playback commands", () => {
  let root: Root;
  let surface: HTMLDivElement;
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
    surface = document.createElement("div");
    surface.tabIndex = -1;
    document.body.appendChild(surface);
    options = {
      metadata: movie,
      playQueue: [movie, { ...movie, ratingKey: "11" }],
      playlistContext: { id: "30", index: 0, libraryID: "2" },
      isGuest: false,
      runtime: {
        getDuration: () => 100,
        seekToLocal: vi.fn(),
        togglePlaying: vi.fn(),
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
      getSurface: () => surface,
    };
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    surface.remove();
  });

  function key(
    target: Element,
    type: "keydown" | "keyup",
    options: KeyboardEventInit = {},
  ) {
    const event = new KeyboardEvent(type, {
      key: " ",
      bubbles: true,
      cancelable: true,
      ...options,
    });
    target.dispatchEvent(event);
    return event;
  }

  it.each(["button", "div"])(
    "uses Space to pause/resume after clicking a focused %s without repeating its action",
    async (tag) => {
      const button = document.createElement(tag);
      button.tabIndex = 0;
      button.setAttribute("role", "button");
      const previousAction = vi.fn();
      button.addEventListener("click", previousAction);
      // Non-native buttons, including MUI ButtonBase, activate on keyup.
      if (tag === "div")
        button.addEventListener("keyup", (event) => {
          if (event.key === " " && !event.defaultPrevented) button.click();
        });
      surface.appendChild(button);
      button.focus();
      button.click();
      vi.mocked(options.runtime.togglePlaying)
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(true);
      await render();
      for (let i = 0; i < 2; i++) {
        expect(key(button, "keydown").defaultPrevented).toBe(true);
        expect(key(button, "keyup").defaultPrevented).toBe(true);
      }
      expect(options.runtime.togglePlaying).toHaveBeenCalledTimes(2);
      expect(options.sync.pause).toHaveBeenCalledTimes(1);
      expect(options.sync.resume).toHaveBeenCalledTimes(1);
      expect(previousAction).toHaveBeenCalledTimes(1);
      expect(document.activeElement).toBe(button);
      expect(key(button, "keydown", { key: "Enter" }).defaultPrevented).toBe(
        false,
      );
    },
  );

  it("toggles only once while Space is held down", async () => {
    await render();
    key(surface, "keydown");
    for (let i = 0; i < 3; i++)
      expect(key(surface, "keydown", { repeat: true }).defaultPrevented).toBe(
        true,
      );
    key(surface, "keyup");
    expect(options.runtime.togglePlaying).toHaveBeenCalledTimes(1);
  });

  it("leaves Space to editors, sliders and overlays inside the fullscreen surface", async () => {
    await render();
    const targets = ["input", "textarea", "select"].map((tag) =>
      document.createElement(tag),
    );
    for (const role of ["slider", "dialog", "menu", "listbox"]) {
      const parent = document.createElement("div");
      parent.setAttribute("role", role);
      const button = document.createElement("button");
      parent.appendChild(button);
      surface.appendChild(parent);
      targets.push(button);
    }
    const editor = document.createElement("div");
    editor.contentEditable = "true";
    editor.setAttribute("contenteditable", "true");
    targets.push(editor);
    for (const target of targets) {
      if (!surface.contains(target)) surface.appendChild(target);
      expect(key(target, "keydown").defaultPrevented).toBe(false);
      expect(key(target, "keyup").defaultPrevented).toBe(false);
    }
    expect(options.runtime.togglePlaying).not.toHaveBeenCalled();
  });

  it("respects disabled shortcuts, modifiers, composition and cleanup", async () => {
    options.enabled = false;
    await render();
    expect(key(surface, "keydown").defaultPrevented).toBe(false);
    options = { ...options, enabled: true };
    await render();
    for (const flags of [
      { altKey: true },
      { ctrlKey: true },
      { metaKey: true },
      { isComposing: true },
    ])
      expect(key(surface, "keydown", flags).defaultPrevented).toBe(false);
    expect(options.runtime.togglePlaying).not.toHaveBeenCalled();
    key(surface, "keydown");
    key(surface, "keyup");
    expect(options.runtime.togglePlaying).toHaveBeenCalledTimes(1);
    await act(async () => root.render(null));
    expect(key(surface, "keydown").defaultPrevented).toBe(false);
    expect(key(surface, "keyup").defaultPrevented).toBe(false);
    expect(options.runtime.togglePlaying).toHaveBeenCalledTimes(1);
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
