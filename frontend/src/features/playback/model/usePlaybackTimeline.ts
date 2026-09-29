import { useCallback, useEffect, useRef } from "react";
import { getTimelineUpdate, sendUniversalPing } from "../api/playback";

type TimelineState = "buffering" | "playing" | "paused" | "stopped";

interface PlaybackTimelineOptions {
  itemID?: string;
  playing: boolean;
  buffering: boolean;
  getCurrentTime: () => number;
  getDuration: () => number;
  onTermination: (message: string) => void;
}

export function currentTimelineState(
  playing: boolean,
  buffering: boolean,
): TimelineState {
  if (buffering) return "buffering";
  return playing ? "playing" : "paused";
}

async function reportTimeline(
  itemID: string,
  state: TimelineState,
  getDuration: () => number,
  getCurrentTime: () => number,
) {
  const numericID = Number.parseInt(itemID, 10);
  if (!Number.isFinite(numericID)) return null;
  return getTimelineUpdate(
    numericID,
    Math.floor(getDuration()) * 1000,
    state,
    Math.floor(getCurrentTime()) * 1000,
  );
}

export function usePlaybackTimeline(options: PlaybackTimelineOptions) {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    if (!options.itemID) return;
    const itemID = options.itemID;
    let active = true;
    let pingPending = false;
    let timelinePending = false;

    const ping = async () => {
      if (pingPending) return;
      pingPending = true;
      try {
        await sendUniversalPing();
      } catch {
        // A later timeline update reports actionable playback errors.
      } finally {
        pingPending = false;
      }
    };
    const update = async () => {
      if (timelinePending) return;
      timelinePending = true;
      try {
        const current = optionsRef.current;
        const result = await reportTimeline(
          itemID,
          currentTimelineState(current.playing, current.buffering),
          current.getDuration,
          current.getCurrentTime,
        );
        if (!active || optionsRef.current.itemID !== itemID || !result) return;
        const { terminationCode, terminationText } = result.MediaContainer;
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
    };
  }, [options.itemID]);

  const reportStopped = useCallback(async () => {
    const current = optionsRef.current;
    if (!current.itemID) return;
    try {
      await reportTimeline(
        current.itemID,
        "stopped",
        current.getDuration,
        current.getCurrentTime,
      );
    } catch {
      // Navigation should not be blocked by a failed final report.
    }
  }, []);

  return { reportStopped };
}
