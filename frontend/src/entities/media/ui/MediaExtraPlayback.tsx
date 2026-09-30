import { Alert, Box, CircularProgress } from "@mui/material";
import React, { useEffect, useRef, useState } from "react";
import VideoPlayer from "shared/ui/VideoPlayer";
import type { VideoPlayerProps } from "shared/ui/VideoPlayer";
import type { VideoPlayerHandle, VideoSource } from "shared/lib/video/types";
import { resolveDiscoverExtra } from "../api/mediaExtras";
import type { TitleExtra } from "../model/mediaExtras";
import { useMediaPlaybackSource } from "../model/useMediaPlaybackSource";

export interface MediaExtraPlaybackProps
  extends Omit<VideoPlayerProps, "source" | "onError"> {
  extra: TitleExtra;
  showErrors?: boolean;
  onPlaybackError?: (message: string) => void;
}

export default function MediaExtraPlayback({
  extra,
  showErrors = true,
  onPlaybackError,
  controls = true,
  ...videoProps
}: MediaExtraPlaybackProps) {
  const local = useMediaPlaybackSource(
    extra.source === "local" ? extra.metadata : null,
  );
  const [discover, setDiscover] = useState<VideoSource | null>(null);
  const [error, setError] = useState<string | null>(null);
  const player = useRef<VideoPlayerHandle>(null);
  const resume = useRef<number | null>(null);
  const errorCallback = useRef(onPlaybackError);
  errorCallback.current = onPlaybackError;

  useEffect(() => {
    let active = true;
    setDiscover(null);
    setError(null);
    resume.current = null;
    if (extra.source === "discover")
      void resolveDiscoverExtra(extra)
        .then((source) => {
          if (active) setDiscover(source);
        })
        .catch(() => {
          if (active) setError("Plex Discover could not prepare this extra.");
        });
    return () => {
      active = false;
    };
  }, [extra]);

  const failure = error || local.error;
  useEffect(() => {
    if (failure) errorCallback.current?.(failure);
  }, [failure]);
  const source = extra.source === "local" ? local.source : discover;

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
      {!source && !failure && <CircularProgress />}
      {failure && showErrors && <Alert severity="error">{failure}</Alert>}
      {source && !failure && (
        <VideoPlayer
          {...videoProps}
          controls={controls}
          ref={player}
          source={source}
          startTime={resume.current ?? videoProps.startTime}
          onError={(reason) => {
            if (player.current && player.current.getDuration() > 0)
              resume.current = player.current.getCurrentTime();
            if (extra.source === "local" && local.recover(reason)) return;
            setError(reason.message);
          }}
        />
      )}
    </Box>
  );
}
