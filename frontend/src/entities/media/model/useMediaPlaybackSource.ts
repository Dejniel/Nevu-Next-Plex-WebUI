import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  getXPlexProps,
  getActiveServerScope,
  PlexRequestError,
  useActiveServerScope,
  useAuthSession,
} from "features/session/model";
import { prepareMediaPlayback, releaseMediaPlayback } from "../api/mediaPlayback";
import { planMediaPlayback, playbackPlanKey } from "./mediaPlayback";
import type { MediaPlaybackQuality, PlexPlaybackSource } from "./mediaPlayback";
import { getMediaVersions } from "./mediaVersions";
import type { MediaVersion } from "./mediaVersions";
import type { VideoPlaybackFailure } from "shared/lib/video/types";
import { idlePlayback, playbackReducer } from "./playbackState";
import type { PlaybackOwner, PlaybackState, PlaybackAttempt } from "./playbackState";

const ORIGINAL: MediaPlaybackQuality = {};

function ownsSession(run: PlaybackOwner) {
  const scope = getActiveServerScope();
  return (
    useAuthSession.getState().revision === run.authRevision &&
    (scope?.serverId ?? "") === run.scope.serverId &&
    (scope?.profileKey ?? "") === run.scope.profileKey
  );
}

function ownedPlayback(state: PlaybackState, sourceId: string) {
  return "source" in state && state.source.id === sourceId && ownsSession(state.run) ? state : null;
}

export function useMediaPlaybackSource(
  metadata: Plex.Metadata | null,
  version?: MediaVersion,
  quality: MediaPlaybackQuality = ORIGINAL,
) {
  const scope = useActiveServerScope();
  const authRevision = useAuthSession((state) => state.revision);
  const [revision, setRevision] = useState(0);
  const [subtitleFailure, setSubtitleFailure] = useState<VideoPlaybackFailure | null>(null);
  const releasing = useRef<Promise<unknown>>(Promise.resolve());
  const selectedVersion = version ?? (metadata ? getMediaVersions(metadata)[0] : undefined);
  const run = useMemo(() => {
    if (!metadata) return null;
    return {
      metadata,
      version: selectedVersion,
      quality: { bitrate: quality.bitrate },
      requestContext: getXPlexProps(),
      scope,
      authRevision,
      initialAttempt: { kind: "initial" } satisfies PlaybackAttempt,
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
        ? { status: "preparing", run, attempt: run.initialAttempt }
        : idlePlayback;
  const current = useRef(state);
  current.current = state;
  const attempt = state.status === "failed" ? null : state.attempt;

  useEffect(() => {
    if (!run) {
      dispatch({ type: "begin", run: null, attempt: null });
      return;
    }
    if (!attempt) return;
    dispatch({ type: "begin", run, attempt });
    const controller = new AbortController();
    let ownedSource: PlexPlaybackSource | null = null;
    const isCurrent = () =>
      !controller.signal.aborted && current.current.run === run && ownsSession(run);
    const onPageHide = (event: PageTransitionEvent) => {
      if (!event.persisted) {
        controller.abort();
        void releaseMediaPlayback(ownedSource, true);
      }
    };
    window.addEventListener("pagehide", onPageHide);
    void (async () => {
      try {
        if (!run.version?.part.key) throw new Error("No playable media file is available.");
        await releasing.current;
        if (!isCurrent()) return;
        const request = await planMediaPlayback(run.version, run.quality, attempt.kind);
        if (!isCurrent()) return;
        if (
          attempt.kind === "compatible" &&
          (!request.stream ||
            playbackPlanKey(request.stream) === playbackPlanKey(attempt.failedPlan))
        )
          throw new Error(attempt.failure.message);
        const { source, plan } = await prepareMediaPlayback(
          run.metadata,
          run.version,
          run.quality,
          request,
          run.requestContext,
          controller.signal,
        );
        ownedSource = source;
        if (!isCurrent()) {
          void releaseMediaPlayback(source);
          return;
        }
        if (
          attempt.kind === "compatible" &&
          playbackPlanKey(plan) === playbackPlanKey(attempt.failedPlan)
        )
          throw new Error(attempt.failure.message);
        dispatch({ type: "source", run, attempt, plan, source });
      } catch (reason) {
        if (!isCurrent()) return;
        dispatch({
          type: "failure",
          run,
          attempt,
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
      releasing.current = releaseMediaPlayback(ownedSource);
    };
  }, [run, attempt]);

  const reportSubtitleError = useCallback((failure: VideoPlaybackFailure) => {
    if (!ownedPlayback(current.current, failure.sourceId)) return false;
    setSubtitleFailure(failure);
    return true;
  }, []);

  const reportError = useCallback((failure: VideoPlaybackFailure) => {
    if (failure.kind === "subtitle") return false;
    const active = ownedPlayback(current.current, failure.sourceId);
    if (!active) return false;
    dispatch({
      type: "failure",
      run: active.run,
      attempt: active.attempt,
      failure,
    });
    return true;
  }, []);
  const reportReady = useCallback((sourceId: string) => {
    if (!ownedPlayback(current.current, sourceId)) return false;
    dispatch({ type: "ready", sourceId });
    return true;
  }, []);
  const reload = useCallback(() => setRevision((value) => value + 1), []);
  return {
    source: "source" in state ? state.source : null,
    error: state.status === "failed" ? state.error : null,
    subtitleError:
      "source" in state && subtitleFailure?.sourceId === state.source.id
        ? subtitleFailure.message
        : null,
    loading: state.status === "preparing" || state.status === "loading",
    reportError,
    reportReady,
    reportSubtitleError,
    reload,
  };
}
