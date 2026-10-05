import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  getXPlexProps,
  getActiveServerScope,
  PlexRequestError,
  useActiveServerScope,
  useAuthSession,
} from "features/session/model";
import {
  createMediaPlaybackSource,
  getMediaPlaybackDecision,
  releaseMediaPlayback,
} from "../api/mediaPlayback";
import {
  initialPlaybackPlan,
  planMediaPlayback,
  playbackDecisionPlan,
  playbackPlanKey,
} from "./mediaPlayback";
import type { MediaPlaybackQuality, PlexPlaybackSource } from "./mediaPlayback";
import { getMediaVersions } from "./mediaVersions";
import type { MediaVersion } from "./mediaVersions";
import type { VideoPlaybackFailure } from "shared/lib/video/types";
import { idlePlayback, playbackReducer } from "./playbackFallback";
import type { PlaybackOwner, PlaybackState, PlaybackStep } from "./playbackFallback";

const ORIGINAL: MediaPlaybackQuality = {};

function ownsSession(run: PlaybackOwner) {
  const scope = getActiveServerScope();
  return (
    useAuthSession.getState().revision === run.authRevision &&
    (scope?.serverId ?? "") === run.scope.serverId &&
    (scope?.profileKey ?? "") === run.scope.profileKey
  );
}

export function useMediaPlaybackSource(
  metadata: Plex.Metadata | null,
  version?: MediaVersion,
  quality: MediaPlaybackQuality = ORIGINAL,
) {
  const scope = useActiveServerScope();
  const authRevision = useAuthSession((state) => state.revision);
  const [revision, setRevision] = useState(0);
  const selectedVersion = version ?? (metadata ? getMediaVersions(metadata)[0] : undefined);
  const run = useMemo(() => {
    if (!metadata) return null;
    const selected = selectedVersion;
    const plan = selected ? initialPlaybackPlan(selected, quality) : null;
    return {
      metadata,
      version: selected,
      quality: { bitrate: quality.bitrate },
      requestContext: getXPlexProps(),
      scope,
      authRevision,
      initialStep: plan
        ? ({ kind: "original", plan } satisfies PlaybackStep)
        : ({ kind: "plex" } satisfies PlaybackStep),
    };
    // Metadata owns the file/track snapshot; indexes identify reconstructed selections.
    // oxlint-disable-next-line react/exhaustive-deps
  }, [
    metadata,
    selectedVersion?.mediaIndex,
    selectedVersion?.partIndex,
    quality.bitrate,
    scope,
    authRevision,
    revision,
  ]);
  const [stored, dispatch] = useReducer(playbackReducer, idlePlayback);
  const state: PlaybackState =
    stored.run === run
      ? stored
      : run
        ? { status: "preparing", run, step: run.initialStep }
        : idlePlayback;
  const current = useRef(state);
  current.current = state;
  const step = state.status === "failed" ? null : state.step;

  useEffect(() => {
    if (!run) {
      dispatch({ type: "begin", run: null, step: null });
      return;
    }
    if (!step) return;
    dispatch({ type: "begin", run, step });
    const controller = new AbortController();
    let ownedSource: PlexPlaybackSource | null = null;
    const onPageHide = (event: PageTransitionEvent) => {
      if (!event.persisted) void releaseMediaPlayback(ownedSource, true);
    };
    window.addEventListener("pagehide", onPageHide);
    void (async () => {
      try {
        if (!run.version?.part.key) throw new Error("No playable media file is available.");
        let plan =
          step.kind === "original"
            ? step.plan
            : await planMediaPlayback(
                run.version,
                run.quality,
                step.kind === "diagnose"
                  ? "convert"
                  : step.burnSubtitles
                    ? "burn-subtitles"
                    : "stream",
              );
        if (controller.signal.aborted || current.current.run !== run || !ownsSession(run)) return;
        if (step.kind === "diagnose") {
          if (plan.kind !== "plex") return;
          const decision = await getMediaPlaybackDecision(
            run.metadata,
            run.version,
            run.quality,
            plan,
            run.requestContext,
            controller.signal,
          );
          if (controller.signal.aborted || current.current.run !== run || !ownsSession(run)) return;
          plan = playbackDecisionPlan(decision, plan);
          if (playbackPlanKey(plan) === playbackPlanKey(step.failedPlan))
            throw new Error(step.failure.message);
        }
        ownedSource = createMediaPlaybackSource(
          run.metadata,
          run.version,
          run.quality,
          plan,
          run.requestContext,
        );
        dispatch({ type: "source", run, step, plan, source: ownedSource });
      } catch (reason) {
        if (controller.signal.aborted || current.current.run !== run || !ownsSession(run)) return;
        dispatch({
          type: "failure",
          run,
          step,
          failure: {
            kind: reason instanceof PlexRequestError ? "network" : "unknown",
            httpStatus: reason instanceof PlexRequestError ? reason.status : undefined,
            message: reason instanceof Error ? reason.message : "Plex could not prepare playback.",
          },
        });
      }
    })();
    return () => {
      controller.abort();
      window.removeEventListener("pagehide", onPageHide);
      void releaseMediaPlayback(ownedSource);
    };
  }, [run, step]);

  const reportError = useCallback((failure: VideoPlaybackFailure) => {
    const active = current.current;
    if (!("source" in active) || active.source.id !== failure.sourceId || !ownsSession(active.run))
      return false;
    dispatch({ type: "failure", run: active.run, step: active.step, failure });
    return true;
  }, []);
  const reportReady = useCallback((sourceId: string) => {
    if (
      !("source" in current.current) ||
      current.current.source.id !== sourceId ||
      !ownsSession(current.current.run)
    )
      return false;
    dispatch({ type: "ready", sourceId });
    return true;
  }, []);
  const reload = useCallback(() => setRevision((value) => value + 1), []);
  return {
    source: "source" in state ? state.source : null,
    error: state.status === "failed" ? state.error : null,
    loading: state.status === "preparing" || state.status === "loading",
    reportError,
    reportReady,
    reload,
  };
}
