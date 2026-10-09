import type { MediaMetadata } from "entities/media/model";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  prepareAudioPlayback,
  releaseAudioPlayback,
  pingAudioPlayback,
} from "../api/musicPlayback";
import type { AudioSource } from "../api/musicPlayback";
import type { VideoPlaybackFailure } from "shared/lib/video/types";

export function useAudioPlaybackSource(
  metadata: MediaMetadata | null,
  context: Record<string, unknown>,
  playbackID: string | null,
  startTime = 0,
) {
  const ratingKey = metadata?.ratingKey;
  const fileKey = metadata?.Media?.[0]?.Part?.[0]?.key;
  const run = useMemo(
    () =>
      metadata && playbackID
        ? { metadata, context, playbackID, startTime }
        : null,
    // Playback owns the file and credentials, not subsequent metadata refreshes.
    // oxlint-disable-next-line react/exhaustive-deps
    [ratingKey, fileKey, context, playbackID, startTime],
  );
  type Attempt = {
    run: NonNullable<typeof run>;
    converted: boolean;
    position: number;
    error?: string;
  };
  const initial = useMemo<Attempt | null>(
    () => (run ? { run, converted: false, position: run.startTime } : null),
    [run],
  );
  const [stored, setStored] = useState<Attempt | null>(null);
  const attempt = stored?.run === run ? stored : initial;
  const [published, setPublished] = useState<{
    attempt: Attempt;
    source: AudioSource;
  } | null>(null);
  const source =
    attempt && attempt.error === undefined && published?.attempt === attempt
      ? published.source
      : null;
  const current = useRef({ attempt, source });
  current.current = { attempt, source };
  const releasing = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    if (!attempt || attempt.error !== undefined) return;
    const controller = new AbortController();
    let owned: AudioSource | null = null;
    let timer: number | undefined;
    const isCurrent = () =>
      !controller.signal.aborted && current.current.attempt === attempt;
    const release = (keepalive = false) => {
      window.clearInterval(timer);
      const source = owned;
      owned = null;
      return source
        ? releaseAudioPlayback(source, keepalive)
        : releasing.current;
    };
    const onPageHide = (event: PageTransitionEvent) => {
      if (event.persisted) return;
      controller.abort();
      releasing.current = release(true);
    };
    window.addEventListener("pagehide", onPageHide);
    void (async () => {
      try {
        await releasing.current;
        if (!isCurrent()) return;
        const source = await prepareAudioPlayback(
          attempt.run.metadata,
          attempt.run.context,
          attempt.converted,
          controller.signal,
        );
        if (!isCurrent()) {
          void releaseAudioPlayback(source);
          return;
        }
        owned = source;
        setPublished({ attempt, source });
        if (source.type !== "file") {
          let pending = false;
          timer = window.setInterval(async () => {
            if (pending) return;
            pending = true;
            try {
              await pingAudioPlayback(source);
            } catch {
              // Keep playback running after a keepalive failure.
            } finally {
              pending = false;
            }
          }, 10000);
        }
      } catch (reason) {
        if (isCurrent())
          setStored({
            ...attempt,
            error:
              reason instanceof Error
                ? reason.message
                : "Plex could not prepare audio playback.",
          });
      }
    })();
    return () => {
      controller.abort();
      window.removeEventListener("pagehide", onPageHide);
      releasing.current = release();
    };
  }, [attempt]);

  const reportError = useCallback((failure: VideoPlaybackFailure) => {
    const { attempt, source } = current.current;
    if (
      !attempt ||
      !source ||
      failure.sourceId !== source.id ||
      failure.kind === "subtitle"
    )
      return false;
    current.current.source = null;
    const convert =
      !attempt.converted &&
      !failure.httpStatus &&
      ["media", "unsupported"].includes(failure.kind);
    setStored(
      convert
        ? { run: attempt.run, converted: true, position: failure.position ?? 0 }
        : { ...attempt, error: failure.message },
    );
    return true;
  }, []);

  return {
    source,
    error: attempt?.error ?? null,
    startTime: attempt?.position ?? 0,
    reportError,
  };
}
