import { useCallback, useEffect, useRef } from "react";
import {
  activePlaybackMarker,
  playbackAdvancePath,
  playbackBrowsePath,
} from "./playbackNavigation";
import type { PlaybackRuntimeController } from "./usePlaybackRuntime";

interface PlaybackSyncCommands {
  pause: () => void;
  resume: () => void;
  seek: (time: number) => void;
  end: () => void;
  leave: () => void;
}

interface PlaybackCommandOptions {
  metadata: Plex.Metadata | null;
  playQueue: Plex.Metadata[] | null;
  isGuest: boolean;
  runtime: PlaybackRuntimeController;
  sync: PlaybackSyncCommands;
  navigate: (path: string) => void;
  reportStopped: () => Promise<void>;
  getSurface: () => HTMLElement | null;
  enabled?: boolean;
}

export function shouldIgnorePlaybackShortcut(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(
    target.closest(
      "input, textarea, select, button, [role='dialog'], [contenteditable]:not([contenteditable='false'])",
    ),
  );
}

export function usePlaybackCommands(options: PlaybackCommandOptions) {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const togglePlayback = useCallback(() => {
    const { runtime, sync } = optionsRef.current;
    const playing = runtime.togglePlaying();
    if (playing) sync.resume();
    else sync.pause();
  }, []);
  const resumePlayback = useCallback(() => {
    const { runtime, sync } = optionsRef.current;
    runtime.setPlaying(true);
    sync.resume();
  }, []);
  const seekTo = useCallback((time: number) => {
    const { runtime, sync } = optionsRef.current;
    const duration = runtime.getDuration();
    const next = Math.max(0, duration > 0 ? Math.min(time, duration) : time);
    runtime.seekToLocal(next);
    sync.seek(next);
  }, []);
  const seekBy = useCallback(
    (offset: number) =>
      seekTo(optionsRef.current.runtime.getCurrentTime() + offset),
    [seekTo],
  );
  const adjustVolume = useCallback((offset: number) => {
    optionsRef.current.runtime.adjustVolume(offset);
  }, []);
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      const surface = optionsRef.current.getSurface();
      if (surface?.requestFullscreen)
        void surface.requestFullscreen().catch(() => undefined);
    } else void document.exitFullscreen().catch(() => undefined);
  }, []);
  const advance = useCallback((restartNext = false, endSession = false) => {
    const { metadata, playQueue, navigate, sync } = optionsRef.current;
    if (!metadata) return;
    const hasNext = metadata.type === "episode" && Boolean(playQueue?.[1]);
    if (endSession && !hasNext) sync.end();
    navigate(playbackAdvancePath(metadata, playQueue, restartNext));
  }, []);
  const advanceFromCredits = useCallback(() => advance(true), [advance]);
  const skipActiveMarker = useCallback(() => {
    const { metadata, runtime } = optionsRef.current;
    const marker = activePlaybackMarker(metadata, runtime.getCurrentTime());
    if (!marker) return;
    if (marker.type === "credits" && marker.final) {
      advance();
      return;
    }
    seekTo(marker.endTimeOffset / 1000 + 1);
  }, [advance, seekTo]);
  const exitPlayback = useCallback(() => {
    const { metadata, navigate, reportStopped, sync } = optionsRef.current;
    sync.leave();
    void reportStopped();
    navigate(metadata ? playbackBrowsePath(metadata) : "/");
  }, []);
  const handleEnded = useCallback(() => {
    if (optionsRef.current.isGuest) return;
    advance(false, true);
  }, [advance]);
  const handleSurfaceClick = useCallback(
    (clickCount: number) => {
      if (clickCount === 1) togglePlayback();
      if (clickCount === 2) {
        toggleFullscreen();
        resumePlayback();
      }
    },
    [resumePlayback, toggleFullscreen, togglePlayback],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        optionsRef.current.enabled === false ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        shouldIgnorePlaybackShortcut(event.target)
      )
        return;
      const actions: Record<string, (() => void) | undefined> = {
        " ": togglePlayback,
        k: togglePlayback,
        j: () => seekBy(-10),
        l: () => seekBy(10),
        s: skipActiveMarker,
        f: toggleFullscreen,
        ArrowLeft: () => seekBy(-10),
        ArrowRight: () => seekBy(10),
        ArrowUp: () => adjustVolume(5),
        ArrowDown: () => adjustVolume(-5),
        ",": () => seekBy(-0.04),
        ".": () => seekBy(0.04),
      };
      const action = actions[event.key];
      if (!action) return;
      event.preventDefault();
      action();
    };

    const surface = optionsRef.current.getSurface();
    surface?.addEventListener("keydown", handleKeyDown);
    return () => surface?.removeEventListener("keydown", handleKeyDown);
  }, [
    adjustVolume,
    seekBy,
    skipActiveMarker,
    toggleFullscreen,
    togglePlayback,
  ]);

  return {
    togglePlayback,
    resumePlayback,
    seekTo,
    seekBy,
    adjustVolume,
    toggleFullscreen,
    advance,
    advanceFromCredits,
    exitPlayback,
    handleEnded,
    handleSurfaceClick,
  };
}

export type PlaybackCommandController = ReturnType<typeof usePlaybackCommands>;
