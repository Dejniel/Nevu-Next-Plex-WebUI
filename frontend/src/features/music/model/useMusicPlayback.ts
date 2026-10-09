import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import type {
  VideoPlaybackFailure,
  VideoPlayerHandle,
  VideoProgress,
} from "shared/lib/video/types";
import { getTranscodeImageURL, mediaArtworkPath } from "entities/media/model";
import { useMusic } from "./MusicProvider";
import { useAudioPlaybackSource } from "./useAudioPlaybackSource";

/** One playback attempt owns its source, reporting and browser media controls. */
export function useMusicPlayback() {
  const music = useMusic();
  const location = useLocation();
  const player = useRef<VideoPlayerHandle | null>(null);
  const [position, setPosition] = useState(music.session?.startTime ?? 0);
  const [endedFor, setEndedFor] = useState<string | null>(null);
  const playbackID = music.session
    ? `${music.session.queueID}/${music.session.entryID}`
    : null;
  const playback = useAudioPlaybackSource(
    music.track,
    music.context,
    playbackID,
    music.session?.startTime,
  );
  const { source } = playback;
  const musicRef = useRef(music);
  musicRef.current = music;
  useEffect(() => {
    if (playback.error) {
      musicRef.current.pause();
      musicRef.current.setError(playback.error);
    }
  }, [playback.error]);
  const track = music.track;
  const progressRef = useRef({
    playbackID,
    time: music.session?.startTime ?? 0,
    duration: 0,
  });
  if (progressRef.current.playbackID !== playbackID)
    progressRef.current = {
      playbackID,
      time: music.session?.startTime ?? 0,
      duration: 0,
    };
  const remember = useCallback(
    (seconds: number) => {
      if (progressRef.current.playbackID !== playbackID) return;
      const entryID = music.session?.entryID;
      if (entryID !== undefined)
        musicRef.current.rememberPosition(entryID, seconds);
      progressRef.current.time = seconds;
      setPosition(seconds);
    },
    [playbackID, music.session?.entryID],
  );
  const seek = useCallback(
    (seconds: number) => {
      if (progressRef.current.playbackID !== playbackID) return;
      player.current?.seekTo(seconds);
      remember(seconds);
    },
    [playbackID, remember],
  );
  useEffect(() => {
    if (location.pathname.startsWith("/watch/")) music.pause();
    // oxlint-disable-next-line react/exhaustive-deps
  }, [location.pathname]);
  useEffect(() => {
    setPosition(music.session?.startTime ?? 0);
  }, [playbackID, music.session?.startTime]);
  useEffect(() => {
    if (!endedFor) return;
    if (endedFor !== playbackID) {
      setEndedFor(null);
      return;
    }
    if (music.busy) return;
    setEndedFor(null);
    void music.step(1);
    // Advance once after queue editing finishes, only for the ended occurrence.
    // oxlint-disable-next-line react/exhaustive-deps
  }, [endedFor, playbackID, music.busy]);
  useEffect(() => {
    const session = music.session;
    if (!track || !session) return;
    let pending = false;
    const progress = progressRef.current;
    const report = async (stopped = false) => {
      if (pending) return;
      pending = true;
      try {
        const current = musicRef.current;
        await music.api.timeline(
          { ...track, playQueueItemID: session.entryID },
          session.queueID,
          stopped ? "stopped" : current.session?.playing ? "playing" : "paused",
          progress.time,
          progress.duration || (track.duration ?? 0) / 1000,
        );
      } catch {
        /* Reporting failures must not interrupt music. */
      } finally {
        pending = false;
      }
    };
    const timer = window.setInterval(() => void report(), 5000);
    return () => {
      window.clearInterval(timer);
      void report(true);
    };
    // oxlint-disable-next-line react/exhaustive-deps
  }, [playbackID, track?.ratingKey]);
  useEffect(() => {
    if (!track || !navigator.mediaSession) return;
    const session = navigator.mediaSession;
    const artwork = mediaArtworkPath(track, "square");
    session.metadata = new MediaMetadata({
      title: track.title,
      artist: track.grandparentTitle,
      album: track.parentTitle,
      artwork: artwork
        ? [{ src: getTranscodeImageURL(artwork, 512, 512) }]
        : [],
    });
    const handlers: Partial<
      Record<MediaSessionAction, MediaSessionActionHandler>
    > = {
      play: () => {
        if (!musicRef.current.session?.playing) musicRef.current.toggle();
      },
      pause: () => musicRef.current.pause(),
      nexttrack: () => void musicRef.current.step(1),
      previoustrack: () => void musicRef.current.step(-1),
      seekto: (event) => {
        if (event.seekTime !== undefined) seek(event.seekTime);
      },
    };
    const registered: MediaSessionAction[] = [];
    for (const [action, handler] of Object.entries(handlers)) {
      try {
        session.setActionHandler(action as MediaSessionAction, handler);
        registered.push(action as MediaSessionAction);
      } catch (error) {
        // Individual OS controls are optional even when Media Session exists.
        if (
          !(error instanceof DOMException && error.name === "NotSupportedError")
        )
          throw error;
      }
    }
    return () => {
      session.metadata = null;
      for (const action of registered) session.setActionHandler(action, null);
    };
  }, [track, seek]);
  useEffect(() => {
    if (navigator.mediaSession)
      navigator.mediaSession.playbackState = music.session?.playing
        ? "playing"
        : "paused";
  }, [music.session?.playing]);

  return {
    player,
    source,
    position,
    seek,
    startTime: playback.startTime,
    onEnded: () => {
      if (progressRef.current.playbackID === playbackID)
        setEndedFor(playbackID);
    },
    onProgress: (progress: VideoProgress) => {
      if (progressRef.current.playbackID !== playbackID) return;
      progressRef.current.duration = player.current?.getDuration() ?? 0;
      remember(progress.playedSeconds);
    },
    onError: (failure: VideoPlaybackFailure) => {
      playback.reportError({
        ...failure,
        position: failure.position ?? position,
      });
    },
  };
}
