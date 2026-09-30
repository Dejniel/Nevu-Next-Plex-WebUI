import { useCallback, useEffect, useRef, useState } from "react";
import type { VideoPlayerHandle } from "shared/lib/video/types";

export type PlaybackPlayerHandle = Pick<
  VideoPlayerHandle,
  "getCurrentTime" | "getDuration" | "seekTo"
>;

interface PlaybackRuntimeOptions {
  getPlayer: () => PlaybackPlayerHandle | null;
  itemID?: string;
}

export function parseStoredVolume(value: string | null) {
  const volume = Number.parseInt(value ?? "", 10);
  return Number.isFinite(volume) ? Math.min(100, Math.max(0, volume)) : 100;
}

export function usePlaybackRuntime(options: PlaybackRuntimeOptions) {
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const pendingResume = useRef<number | null>(null);
  const appliedInitialResume = useRef<string | null>(null);

  const playingRef = useRef(true);
  const [playing, setPlayingState] = useState(true);
  const [progress, setProgress] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [buffering, setBuffering] = useState(false);
  const [volume, setVolumeState] = useState(() =>
    parseStoredVolume(localStorage.getItem("volume")),
  );
  const volumeRef = useRef(volume);

  const getCurrentTime = useCallback(
    () => optionsRef.current.getPlayer()?.getCurrentTime() ?? 0,
    [],
  );
  const getDuration = useCallback(
    () => optionsRef.current.getPlayer()?.getDuration() ?? 0,
    [],
  );
  const seekToLocal = useCallback((time: number) => {
    const player = optionsRef.current.getPlayer();
    if (!player || player.getDuration() <= 0)
      pendingResume.current = Math.max(0, time);
    else player.seekTo(Math.max(0, time));
  }, []);
  const setPlaying = useCallback((nextPlaying: boolean) => {
    playingRef.current = nextPlaying;
    setPlayingState(nextPlaying);
  }, []);
  const togglePlaying = useCallback(() => {
    const nextPlaying = !playingRef.current;
    setPlaying(nextPlaying);
    return nextPlaying;
  }, [setPlaying]);
  const setVolume = useCallback((nextVolume: number) => {
    const normalized = Math.min(100, Math.max(0, nextVolume));
    volumeRef.current = normalized;
    setVolumeState(normalized);
    localStorage.setItem("volume", normalized.toString());
  }, []);
  const adjustVolume = useCallback(
    (offset: number) => setVolume(volumeRef.current + offset),
    [setVolume],
  );
  const sourceChanging = useCallback(() => {
    setBuffering(false);
    setProgress(0);
    setBuffered(0);
  }, []);
  const requestResumeAt = useCallback((time: number) => {
    pendingResume.current = time;
  }, []);
  const getResumePosition = useCallback(
    (itemID?: string, initialResumeSeconds?: number | null) => {
      if (pendingResume.current !== null) return pendingResume.current;
      if (
        itemID &&
        initialResumeSeconds &&
        appliedInitialResume.current !== `${itemID}:${initialResumeSeconds}`
      )
        return initialResumeSeconds;
      return null;
    },
    [],
  );
  const handleReady = useCallback(
    (itemID?: string, initialResumeSeconds?: number | null) => {
      if (pendingResume.current !== null) {
        seekToLocal(pendingResume.current);
        pendingResume.current = null;
        return;
      }
      if (!itemID || !initialResumeSeconds) return;
      const resumeKey = `${itemID}:${initialResumeSeconds}`;
      if (appliedInitialResume.current === resumeKey) return;
      seekToLocal(initialResumeSeconds);
      appliedInitialResume.current = resumeKey;
    },
    [seekToLocal],
  );
  const handleProgress = useCallback(
    (next: { playedSeconds: number; loadedSeconds: number }) => {
      setProgress(next.playedSeconds);
      setBuffered(next.loadedSeconds);
    },
    [],
  );

  useEffect(() => {
    pendingResume.current = null;
    appliedInitialResume.current = null;
    setPlaying(true);
    sourceChanging();
  }, [options.itemID, setPlaying, sourceChanging]);

  return {
    playing,
    progress,
    buffered,
    buffering,
    volume,
    setPlaying,
    togglePlaying,
    setBuffering,
    setVolume,
    adjustVolume,
    getCurrentTime,
    getDuration,
    seekToLocal,
    sourceChanging,
    requestResumeAt,
    getResumePosition,
    handleReady,
    handleProgress,
  };
}

export type PlaybackRuntimeController = ReturnType<typeof usePlaybackRuntime>;
