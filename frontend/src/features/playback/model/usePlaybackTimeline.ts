import { useCallback, useEffect, useRef } from "react";
import { getTimelineUpdate, type PlaybackTimelineState } from "../api/playback";
import { pingMediaPlayback } from "entities/media/model";
import type { PlexPlaybackSource } from "entities/media/model";

interface PlaybackTimelineOptions {
  itemID?: string;
  playing: boolean;
  buffering: boolean;
  getCurrentTime: () => number;
  getDuration: () => number;
  onTermination: (message: string) => void;
  source?: PlexPlaybackSource | null;
}

interface TimelineSession {
  itemID: string;
  time: number;
  duration: number;
  started: boolean;
  stopped: boolean;
  source?: PlexPlaybackSource;
}

export function currentTimelineState(
  playing: boolean,
  buffering: boolean,
): PlaybackTimelineState {
  return buffering ? "buffering" : playing ? "playing" : "paused";
}

async function reportTimeline(session: TimelineSession, state: PlaybackTimelineState) {
  const numericID = Number.parseInt(session.itemID, 10);
  if (!Number.isFinite(numericID) || !session.source) return null;
  return getTimelineUpdate(
    numericID,
    Math.floor(session.duration * 1000),
    state,
    Math.floor(session.time * 1000),
    session.source,
  );
}

async function stopSession(session: TimelineSession | null) {
  if (!session?.started || session.stopped) return;
  session.stopped = true;
  try {
    await reportTimeline(session, "stopped");
  } catch {
    // Navigation should not be blocked by a failed final report.
  }
}

export function usePlaybackTimeline(options: PlaybackTimelineOptions) {
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const sessionRef = useRef<TimelineSession | null>(null);
  if (sessionRef.current?.itemID !== options.itemID) {
    sessionRef.current = options.itemID
      ? {
          itemID: options.itemID,
          time: 0,
          duration: 0,
          started: false,
          stopped: false,
        }
      : null;
  }
  const session = sessionRef.current;
  if (session && options.source) {
    session.source = options.source;
    const duration = options.getDuration();
    if (duration > 0) {
      session.started = true;
      session.time = options.getCurrentTime();
      session.duration = duration;
    }
  }

  useEffect(() => {
    if (!session) return;
    let active = true;
    let pingPending = false;
    let timelinePending = false;
    const ping = async () => {
      const source = optionsRef.current.source;
      if (pingPending || !source || session.stopped) return;
      pingPending = true;
      try {
        await pingMediaPlayback(source);
      } catch {
        // A transient reporting failure must not stop local playback.
      } finally {
        pingPending = false;
      }
    };
    const update = async () => {
      if (
        timelinePending ||
        !session.started ||
        session.stopped ||
        !optionsRef.current.source
      )
        return;
      timelinePending = true;
      try {
        const current = optionsRef.current;
        const result = await reportTimeline(
          session,
          currentTimelineState(current.playing, current.buffering),
        );
        if (!active || !result) return;
        const { terminationCode, terminationText } = result;
        if (terminationCode)
          current.onTermination(`${terminationCode} - ${terminationText}`);
      } catch {
        // A transient reporting failure must not stop local playback.
      } finally {
        timelinePending = false;
      }
    };
    const pingInterval = window.setInterval(() => void ping(), 10_000);
    const timelineInterval = window.setInterval(() => void update(), 5_000);
    return () => {
      active = false;
      window.clearInterval(pingInterval);
      window.clearInterval(timelineInterval);
      void stopSession(session);
    };
  }, [session]);

  const reportStopped = useCallback(() => stopSession(sessionRef.current), []);
  return { reportStopped };
}
