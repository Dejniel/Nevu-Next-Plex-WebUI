import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import type {
  VideoPlaybackFailure,
  VideoPlayerHandle,
  VideoProgress,
} from "shared/lib/video/types";
import { getTranscodeImageURL, mediaArtworkPath } from "entities/media/model";
import { audioSource, releaseAudioSource, pingAudioSource } from "../api/music";
import { useMusic } from "./MusicProvider";

/** One playback attempt owns its source, reporting and browser media controls. */
export function useMusicPlayback() {
  const music = useMusic();
  const location = useLocation();
  const player = useRef<VideoPlayerHandle | null>(null);
  const [position, setPosition] = useState(0);
  const [attempt, setAttempt] = useState<{
    entry: number;
    position: number;
  } | null>(null);
  const entry = music.session?.entryID;
  const converted = attempt?.entry === entry;
  const prepared = useMemo(() => {
    if (!music.track) return { source: null, error: null };
    try {
      return {
        source: audioSource(music.track, music.context, converted),
        error: null,
      };
    } catch (error) {
      return {
        source: null,
        error:
          error instanceof Error
            ? error.message
            : "This track could not be loaded.",
      };
    }
    // Source owns its credentials; player events do not recreate it.
    // oxlint-disable-next-line react/exhaustive-deps
  }, [music.track?.ratingKey, music.track?.Media, entry, converted]);
  const source = prepared.source;
  const musicRef = useRef(music);
  musicRef.current = music;
  useEffect(() => {
    if (prepared.error) {
      musicRef.current.pause();
      musicRef.current.setError(prepared.error);
    }
  }, [prepared.error]);
  const track = music.track;
  const progressRef = useRef({ entry, time: 0, duration: 0 });
  if (progressRef.current.entry !== entry)
    progressRef.current = { entry, time: 0, duration: 0 };
  const stateRef = useRef({ music, source });
  stateRef.current = { music, source };
  useEffect(() => {
    if (location.pathname.startsWith("/watch/")) music.pause();
    // oxlint-disable-next-line react/exhaustive-deps
  }, [location.pathname]);
  useEffect(() => {
    setPosition(0);
  }, [entry]);
  useEffect(() => {
    if (!source) return;
    let pending = false;
    const timer = window.setInterval(async () => {
      if (pending) return;
      pending = true;
      try {
        await pingAudioSource(source);
      } catch {
        /* Retain local playback after a reporting failure. */
      } finally {
        pending = false;
      }
    }, 10000);
    return () => {
      window.clearInterval(timer);
      void releaseAudioSource(source);
    };
  }, [source]);
  useEffect(() => {
    const session = music.session;
    if (!track || !session) return;
    let pending = false;
    const progress = progressRef.current;
    const report = async (stopped = false) => {
      if (pending) return;
      pending = true;
      try {
        const current = stateRef.current.music;
        await music.api.timeline(
          { ...track, playQueueItemID: session.entryID },
          session.queueID,
          stopped ? "stopped" : current.session?.playing ? "playing" : "paused",
          progress.time,
          progress.duration || track.duration / 1000,
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
  }, [entry, track?.ratingKey]);
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
        if (!stateRef.current.music.session?.playing)
          stateRef.current.music.toggle();
      },
      pause: () => stateRef.current.music.pause(),
      nexttrack: () => void stateRef.current.music.step(1),
      previoustrack: () => void stateRef.current.music.step(-1),
      seekto: (event) => {
        if (event.seekTime !== undefined)
          player.current?.seekTo(event.seekTime);
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
  }, [track]);
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
    setPosition,
    startTime: converted ? attempt?.position : 0,
    onProgress: (progress: VideoProgress) => {
      progressRef.current.time = progress.playedSeconds;
      progressRef.current.duration = player.current?.getDuration() ?? 0;
      setPosition(progress.playedSeconds);
    },
    onError: (failure: VideoPlaybackFailure) => {
      if (failure.sourceId !== source?.id) return;
      if (!converted && ["media", "unsupported"].includes(failure.kind))
        setAttempt({ entry: entry!, position: failure.position ?? position });
      else {
        music.pause();
        music.setError(failure.message);
      }
    },
  };
}
