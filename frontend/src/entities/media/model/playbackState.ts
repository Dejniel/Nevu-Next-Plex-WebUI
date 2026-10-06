import type { VideoPlaybackError } from "shared/lib/video/types";
import type { PlexPlaybackPlan, PlexPlaybackSource } from "./mediaPlayback";

export interface PlaybackOwner {
  authRevision: number;
  scope: { serverId: string; profileKey: string };
}

export type PlaybackAttempt =
  | { kind: "initial" }
  | {
      kind: "compatible";
      failedPlan: PlexPlaybackPlan;
      failure: VideoPlaybackError;
    };

export type PlaybackState =
  | { status: "idle"; run: null; attempt: null }
  | { status: "preparing"; run: PlaybackOwner; attempt: PlaybackAttempt }
  | {
      status: "loading" | "ready";
      run: PlaybackOwner;
      attempt: PlaybackAttempt;
      plan: PlexPlaybackPlan;
      source: PlexPlaybackSource;
    }
  | {
      status: "failed";
      run: PlaybackOwner;
      attempt: PlaybackAttempt;
      error: string;
      canTryOriginal: boolean;
    };

export type PlaybackAction =
  | {
      type: "begin";
      run: PlaybackOwner | null;
      attempt: PlaybackAttempt | null;
    }
  | {
      type: "source";
      run: PlaybackOwner;
      attempt: PlaybackAttempt;
      plan: PlexPlaybackPlan;
      source: PlexPlaybackSource;
    }
  | { type: "ready"; sourceId: string }
  | {
      type: "failure";
      run: PlaybackOwner;
      attempt: PlaybackAttempt;
      failure: VideoPlaybackError;
      canTryOriginal?: boolean;
    };

export const idlePlayback: PlaybackState = {
  status: "idle",
  run: null,
  attempt: null,
};

export function playbackReducer(state: PlaybackState, action: PlaybackAction): PlaybackState {
  if (action.type === "begin")
    return action.run && action.attempt
      ? { status: "preparing", run: action.run, attempt: action.attempt }
      : idlePlayback;
  if (action.type === "ready")
    return state.status === "loading" && state.source.id === action.sourceId
      ? { ...state, status: "ready" }
      : state;
  if (state.run !== action.run || state.attempt !== action.attempt) return state;
  if (action.type === "source")
    return {
      status: "loading",
      run: action.run,
      attempt: action.attempt,
      plan: action.plan,
      source: action.source,
    };
  if (state.status !== "loading" && state.status !== "ready" && state.status !== "preparing")
    return state;
  if (action.failure.kind === "subtitle") return state;
  const recover =
    "plan" in state &&
    state.attempt.kind === "initial" &&
    !action.failure.httpStatus &&
    (action.failure.kind === "media" || action.failure.kind === "unsupported");
  const next: PlaybackAttempt | null = recover
    ? { kind: "compatible", failedPlan: state.plan, failure: action.failure }
    : null;
  return next
    ? { status: "preparing", run: state.run, attempt: next }
    : {
        status: "failed",
        run: state.run,
        attempt: state.attempt,
        error: action.failure.message,
        canTryOriginal: action.canTryOriginal ?? false,
      };
}
