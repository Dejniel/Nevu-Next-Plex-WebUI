import {
  Alert,
  Box,
  CircularProgress,
  Dialog,
  IconButton,
  Typography,
} from "@mui/material";
import { CloseRounded } from "@mui/icons-material";
import React, { useEffect, useRef, useState } from "react";
import { resolveExtraURL, TitleExtra } from "../../plex/discover";

export default function TrailerDialog({
  extra,
  onClose,
}: {
  extra: TitleExtra | null;
  onClose: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    let active = true;
    setUrl(null);
    setError(null);
    if (!extra)
      return () => {
        active = false;
      };

    resolveExtraURL(extra)
      .then((resolvedURL) => active && setUrl(resolvedURL))
      .catch((reason) => {
        if (!active) return;
        setError(reason instanceof Error ? reason.message : "Unable to play this extra.");
      });

    return () => {
      active = false;
    };
  }, [extra]);

  useEffect(() => {
    const video = videoRef.current;
    if (!url || !video || !extra) return;

    if (extra.source !== "discover") {
      video.src = url;
      return () => {
        video.removeAttribute("src");
        video.load();
      };
    }

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = url;
      return () => {
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
          setError("This browser cannot play HLS video.");
          return;
        }

        hls = new Hls();
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

          setError(`Unable to play this HLS stream (${data.details}).`);
        });

        hls.loadSource(url);
        hls.attachMedia(video);
      })
      .catch(() => {
        if (active) setError("Unable to load the HLS player.");
      });

    return () => {
      active = false;
      hls?.destroy();
    };
  }, [extra, url]);

  return (
    <Dialog
      open={Boolean(extra)}
      onClose={onClose}
      fullScreen
      PaperProps={{ sx: { bgcolor: "#000", border: 0 } }}
    >
      <IconButton
        aria-label="Close player"
        onClick={onClose}
        sx={{
          position: "absolute",
          top: 12,
          right: 12,
          zIndex: 2,
          bgcolor: "rgba(0,0,0,0.7)",
        }}
      >
        <CloseRounded />
      </IconButton>

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
        {error && <Alert severity="error">{error}</Alert>}
        {url && !error && (
          <video
            ref={videoRef}
            autoPlay
            controls
            playsInline
            onEnded={onClose}
            onError={() => {
              if (extra?.source !== "discover")
                setError("Unable to play this video file.");
            }}
            style={{ objectFit: "contain", width: "100%", height: "100%" }}
          />
        )}
      </Box>

      {extra && (
        <Typography
          sx={{
            position: "absolute",
            left: 20,
            bottom: 16,
            maxWidth: "calc(100% - 40px)",
            textShadow: "0 1px 4px #000",
          }}
        >
          {extra.metadata.title}
        </Typography>
      )}
    </Dialog>
  );
}
