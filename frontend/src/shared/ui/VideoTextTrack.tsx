import { useCallback, useEffect, useRef, useState } from "react";
import { toWebVTT } from "shared/lib/video/subtitles";
import { appendWebVTTCues } from "shared/lib/video/webvtt";
import type {
  VideoPlaybackFailure,
  VideoTextTrack as TextTrackSource,
} from "shared/lib/video/types";

export default function VideoTextTrack({
  source,
  sourceId,
  getPosition,
  onError,
  reading,
  revision,
}: {
  source: TextTrackSource;
  sourceId: string;
  getPosition: () => number | undefined;
  onError: (failure: VideoPlaybackFailure) => void;
  reading: boolean;
  revision: number;
}) {
  const ref = useRef<HTMLTrackElement>(null);
  const callbacks = useRef({ getPosition, onError });
  callbacks.current = { getPosition, onError };
  const [blob, setBlob] = useState<string>();
  const requestRevision = source.streaming ? revision : 0;
  const requestEnabled = !source.streaming || reading;
  const reportFailure = useCallback(
    (message: string, httpStatus?: number) => {
      callbacks.current.onError({
        sourceId,
        kind: "subtitle",
        message,
        httpStatus,
        position: callbacks.current.getPosition(),
      });
    },
    [sourceId],
  );
  const attach = useCallback(
    (element: HTMLTrackElement | null) => {
      ref.current = element;
      if (!element) return;
      // Keep browser timing/cuechange events; VideoCaptions owns presentation.
      element.track.mode = "hidden";
      const nativeError = () =>
        reportFailure("The selected subtitles could not be loaded.");
      if (!source.streaming) element.addEventListener("error", nativeError);
      return () => {
        element.removeEventListener("error", nativeError);
        element.removeAttribute("src");
        ref.current = null;
      };
    },
    [reportFailure, source.streaming],
  );

  useEffect(() => {
    const element = ref.current;
    if (source.streaming && !element) return;
    const controller = new AbortController();
    const { signal } = controller;
    let blobURL: string | undefined;
    const fail = (message: string, httpStatus?: number) => {
      if (!signal.aborted) reportFailure(message, httpStatus);
    };

    if (requestEnabled && (source.streaming || source.format === "srt"))
      void (async () => {
        try {
          const response = await fetch(source.url, {
            signal,
            ...(source.streaming && { cache: "no-store" }),
          });
          if (!response.ok)
            return fail(
              "The selected subtitles could not be loaded.",
              response.status,
            );
          if (source.streaming) {
            if (!response.body)
              throw new Error("The subtitle stream is empty.");
            await appendWebVTTCues(response.body, element!.track, signal);
          } else {
            const text = toWebVTT(await response.text());
            signal.throwIfAborted();
            blobURL = URL.createObjectURL(
              new Blob([text], { type: "text/vtt" }),
            );
            setBlob(blobURL);
          }
        } catch (error) {
          fail(
            error instanceof Error
              ? error.message
              : "The selected subtitles could not be loaded.",
          );
        }
      })();

    return () => {
      controller.abort();
      element?.removeAttribute("src");
      if (blobURL) URL.revokeObjectURL(blobURL);
    };
  }, [source, reportFailure, requestEnabled, requestRevision]);

  if (!source.streaming && source.format === "srt" && !blob) return null;
  return (
    <track
      ref={attach}
      src={
        source.streaming
          ? undefined
          : source.format === "srt"
            ? blob
            : source.url
      }
      kind="subtitles"
      srcLang={source.language}
      label={source.label}
      default
    />
  );
}
