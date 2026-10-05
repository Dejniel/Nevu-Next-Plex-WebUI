import type { VideoPlaybackError } from "shared/lib/video/types";
import type { PlexPlaybackPlan, PlexPlaybackSource } from "./mediaPlayback";

export interface PlaybackOwner {
  authRevision: number;
  scope: { serverId: string; profileKey: string };
}

export type PlaybackStep =
  | { kind: "original"; plan: Extract<PlexPlaybackPlan, { kind: "original" }> }
  | { kind: "plex"; burnSubtitles?: boolean }
  | { kind: "diagnose"; failedPlan: PlexPlaybackPlan; failure: VideoPlaybackError };

export type PlaybackState =
  | { status: "idle"; run: null; step: null }
  | { status: "preparing"; run: PlaybackOwner; step: PlaybackStep }
  | {
      status: "loading" | "ready";
      run: PlaybackOwner;
      step: PlaybackStep;
      plan: PlexPlaybackPlan;
      source: PlexPlaybackSource;
    }
  | { status: "failed"; run: PlaybackOwner; step: PlaybackStep; error: string };

export type PlaybackAction =
  | { type: "begin"; run: PlaybackOwner | null; step: PlaybackStep | null }
  | {
      type: "source";
      run: PlaybackOwner;
      step: PlaybackStep;
      plan: PlexPlaybackPlan;
      source: PlexPlaybackSource;
    }
  | { type: "ready"; sourceId: string }
  | { type: "failure"; run: PlaybackOwner; step: PlaybackStep; failure: VideoPlaybackError };

export const idlePlayback: PlaybackState = { status: "idle", run: null, step: null };

function canRecover(failure: VideoPlaybackError) {
  if (failure.httpStatus && [401, 403, 404, 410, 429].includes(failure.httpStatus)) return false;
  return failure.kind !== "network" || Boolean(failure.httpStatus && failure.httpStatus >= 500);
}

export function playbackReducer(state: PlaybackState, action: PlaybackAction): PlaybackState {
  if (action.type === "begin")
    return action.run && action.step
      ? { status: "preparing", run: action.run, step: action.step }
      : idlePlayback;
  if (action.type === "ready")
    return state.status === "loading" && state.source.id === action.sourceId
      ? { ...state, status: "ready" }
      : state;
  if (state.run !== action.run || state.step !== action.step) return state;
  if (action.type === "source")
    return {
      status: "loading",
      run: action.run,
      step: action.step,
      plan: action.plan,
      source: action.source,
    };
  if (state.status !== "loading" && state.status !== "ready" && state.status !== "preparing")
    return state;
  let next: PlaybackStep | undefined;
  if (canRecover(action.failure)) {
    if (state.step.kind === "original" && "plan" in state)
      next = { kind: "plex", burnSubtitles: action.failure.kind === "subtitle" };
    else if (state.step.kind === "plex" && "plan" in state)
      next = { kind: "diagnose", failedPlan: state.plan, failure: action.failure };
  }
  return next
    ? { status: "preparing", run: state.run, step: next }
    : { status: "failed", run: state.run, step: state.step, error: action.failure.message };
}
