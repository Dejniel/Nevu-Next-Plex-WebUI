import { useCallback, useEffect, useRef, useState } from "react";
import {
  releaseMediaPlayback,
  resolveMediaPlayback,
} from "../api/mediaPlayback";
import type { MediaPlaybackQuality, PlexPlaybackSource } from "./mediaPlayback";
import type { MediaVersion } from "./mediaVersions";
import type { VideoPlaybackError } from "shared/lib/video/types";

const ORIGINAL: MediaPlaybackQuality = {};

export function useMediaPlaybackSource(
  metadata: Plex.Metadata | null,
  version?: MediaVersion,
  quality: MediaPlaybackQuality = ORIGINAL,
) {
  const [source, setSource] = useState<PlexPlaybackSource | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [attempt, setAttempt] = useState({ revision: 0, compatibility: false });
  const selectedTracks = version?.part.Stream?.filter(
    (stream) => stream.selected,
  )
    .map((stream) => stream.id)
    .join(",");
  const identity = `${metadata?.ratingKey}:${version?.mediaIndex}:${version?.partIndex}:${selectedTracks}:${quality.bitrate}`;
  const recovery = useRef<{ identity: string; used: boolean }>({
    identity,
    used: false,
  });
  if (recovery.current.identity !== identity)
    recovery.current = { identity, used: false };

  useEffect(() => {
    let active = true;
    let ownedSource: PlexPlaybackSource | null = null;
    const onPageHide = (event: PageTransitionEvent) => {
      if (!event.persisted) void releaseMediaPlayback(ownedSource, true);
    };
    window.addEventListener("pagehide", onPageHide);
    setSource(null);
    setError(null);
    setLoading(Boolean(metadata));
    if (metadata) {
      const compatibility = recovery.current.used && attempt.compatibility;
      void resolveMediaPlayback(metadata, quality, version, compatibility)
        .then(async (next) => {
          if (!active) {
            await releaseMediaPlayback(next);
            return;
          }
          ownedSource = next;
          setSource(next);
          setLoading(false);
        })
        .catch((reason) => {
          if (!active) return;
          setError(
            reason instanceof Error
              ? reason.message
              : "Plex could not prepare playback.",
          );
          setLoading(false);
        });
    }
    return () => {
      active = false;
      window.removeEventListener("pagehide", onPageHide);
      void releaseMediaPlayback(ownedSource);
    };
    // Version objects are reconstructed from metadata; indexes identify the selection.
    // oxlint-disable-next-line react/exhaustive-deps
  }, [
    metadata,
    version?.mediaIndex,
    version?.partIndex,
    quality.bitrate,
    attempt,
  ]);

  const recover = useCallback((failure: VideoPlaybackError) => {
    if (
      failure.kind !== "media" &&
      failure.kind !== "unsupported" &&
      failure.kind !== "subtitle"
    )
      return false;
    if (recovery.current.used) return false;
    recovery.current.used = true;
    setAttempt((previous) => ({
      revision: previous.revision + 1,
      compatibility: true,
    }));
    return true;
  }, []);

  const reload = useCallback(() => {
    setAttempt((previous) => ({
      ...previous,
      revision: previous.revision + 1,
    }));
  }, []);

  return { source, error, loading, recover, reload };
}
