import { Alert, Box, CircularProgress } from "@mui/material";
import React, { useEffect, useRef, useState } from "react";
import { resolveExtraURL } from "../api/titleExtras";
import { TitleExtra } from "../model/titleExtras";

export default function ExtraPlayer({
  extra,
  autoPlay = false,
  muted = false,
  controls = true,
  objectFit = "contain",
  showErrors = true,
  playing,
  volume = 1,
  poster,
  onEnded,
  onPlaying,
  onPlayRejected,
  onPlaybackError,
}: {
  extra: TitleExtra;
  autoPlay?: boolean;
  muted?: boolean;
  controls?: boolean;
  objectFit?: React.CSSProperties["objectFit"];
  showErrors?: boolean;
  playing?: boolean;
  volume?: number;
  poster?: string;
  onEnded?: () => void;
  onPlaying?: () => void;
  onPlayRejected?: () => void;
  onPlaybackError?: (message: string) => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const shouldPlayRef = useRef(autoPlay || Boolean(playing));
  const sourceReadyRef = useRef(false);

  useEffect(() => {
    shouldPlayRef.current = autoPlay || Boolean(playing);
  }, [autoPlay, playing]);

  useEffect(() => {
    let active = true;
    sourceReadyRef.current = false;
    setUrl(null);
    setError(null);

    resolveExtraURL(extra)
      .then((resolvedURL) => active && setUrl(resolvedURL))
      .catch((reason) => {
        if (!active) return;
        const message =
          reason instanceof Error ? reason.message : "Unable to play this extra.";
        setError(message);
        onPlaybackError?.(message);
      });

    return () => {
      active = false;
    };
  }, [extra]);

  useEffect(() => {
    const video = videoRef.current;
    if (!url || !video) return;

    if (extra.source !== "discover") {
      video.src = url;
      sourceReadyRef.current = true;
      return () => {
        sourceReadyRef.current = false;
        video.removeAttribute("src");
        video.load();
      };
    }

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = url;
      sourceReadyRef.current = true;
      return () => {
        sourceReadyRef.current = false;
        video.removeAttribute("src");
        video.load();
      };
    }

    let active = true;
    let hls: import("hls.js").default | null = null;

    import("hls.js")
      .then(({ default: Hls }) => {
        if (!active) return;
        if (!Hls.isSupported()) {
          const message = "This browser cannot play HLS video.";
          setError(message);
          onPlaybackError?.(message);
          return;
        }

        hls = new Hls({
          capLevelToPlayerSize: true,
          abrEwmaDefaultEstimate: 5_000_000,
          maxDevicePixelRatio: 2,
        });
        let networkRetries = 0;
        let mediaRetries = 0;

        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (!data.fatal || !hls) return;

          if (
            data.type === Hls.ErrorTypes.NETWORK_ERROR &&
            networkRetries < 1
          ) {
            networkRetries += 1;
            hls.startLoad();
            return;
          }

          if (data.type === Hls.ErrorTypes.MEDIA_ERROR && mediaRetries < 1) {
            mediaRetries += 1;
            hls.recoverMediaError();
            return;
          }

          const message = `Unable to play this HLS stream (${data.details}).`;
          setError(message);
          onPlaybackError?.(message);
        });

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          sourceReadyRef.current = true;
          if (shouldPlayRef.current)
            void video.play().catch(() => undefined);
        });

        hls.on(Hls.Events.MEDIA_ATTACHED, () => {
          hls?.loadSource(url);
        });
        hls.attachMedia(video);
      })
      .catch(() => {
        if (!active) return;
        const message = "Unable to load the HLS player.";
        setError(message);
        onPlaybackError?.(message);
      });

    return () => {
      active = false;
      sourceReadyRef.current = false;
      hls?.destroy();
    };
  }, [extra.source, url]);

  useEffect(() => {
    const video = videoRef.current;
    if (!url || !video || playing === undefined) return;

    if (playing && sourceReadyRef.current)
      void video.play().catch(() => {
        if (video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA)
          onPlayRejected?.();
      });
    else video.pause();
  }, [playing, url]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.volume = volume;
  }, [volume, url]);

  return (
    <Box
      sx={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        bgcolor: "#000",
      }}
    >
      {!url && !error && <CircularProgress />}
      {error && showErrors && <Alert severity="error">{error}</Alert>}
      {url && !error && (
        <video
          ref={videoRef}
          autoPlay={autoPlay}
          muted={muted}
          controls={controls}
          playsInline
          poster={poster}
          preload={autoPlay ? "auto" : "metadata"}
          controlsList="nodownload"
          disablePictureInPicture
          onEnded={onEnded}
          onCanPlay={() => {
            sourceReadyRef.current = true;
            const video = videoRef.current;
            if (video && shouldPlayRef.current)
              void video.play().catch(() => onPlayRejected?.());
          }}
          onPlaying={() => {
            requestAnimationFrame(() => onPlaying?.());
          }}
          onError={() => {
            const message = "Unable to play this video stream.";
            setError(message);
            onPlaybackError?.(message);
          }}
          style={{ objectFit, width: "100%", height: "100%" }}
        />
      )}
    </Box>
  );
}
