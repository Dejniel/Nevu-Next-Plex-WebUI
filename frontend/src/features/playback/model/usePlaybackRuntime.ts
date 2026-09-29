import { useCallback, useRef, useState } from "react";

export interface PlaybackPlayerHandle {
  getCurrentTime: () => number;
  getDuration: () => number;
  seekTo: (amount: number, type?: "seconds" | "fraction") => void;
}

interface PlaybackRuntimeOptions {
  getPlayer: () => PlaybackPlayerHandle | null;
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
    optionsRef.current.getPlayer()?.seekTo(Math.max(0, time), "seconds");
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
  const handleReady = useCallback(
    (itemID?: string, initialResumeSeconds?: number | null) => {
      setPlaying(true);

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
    [seekToLocal, setPlaying],
  );
  const handleProgress = useCallback(
    (next: { playedSeconds: number; loadedSeconds: number }) => {
      setProgress(next.playedSeconds);
      setBuffered(next.loadedSeconds);
    },
    [],
  );

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
    handleReady,
    handleProgress,
  };
}

export type PlaybackRuntimeController = ReturnType<typeof usePlaybackRuntime>;
