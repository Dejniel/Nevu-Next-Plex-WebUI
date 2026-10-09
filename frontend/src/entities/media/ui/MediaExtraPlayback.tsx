import { Alert, Box, Button, CircularProgress } from "@mui/material";
import { useEffect, useRef, useState } from "react";
import VideoPlayer from "shared/ui/VideoPlayer";
import type { VideoPlayerProps } from "shared/ui/VideoPlayer";
import type { VideoPlayerHandle, VideoSource } from "shared/lib/video/types";
import { resolveDiscoverExtra } from "../api/mediaExtras";
import type { TitleExtra } from "../model/mediaExtras";
import { useMediaPlaybackSource } from "../model/useMediaPlaybackSource";

export interface MediaExtraPlaybackProps extends Omit<VideoPlayerProps, "source" | "onError"> {
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
  const local = useMediaPlaybackSource(extra.source === "local" ? extra.metadata : null);
  const [discover, setDiscover] = useState<VideoSource | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [playing, setPlaying] = useState(videoProps.autoPlay ?? false);
  const player = useRef<VideoPlayerHandle>(null);
  const resume = useRef<number | null>(null);
  const errorCallback = useRef(onPlaybackError);
  errorCallback.current = onPlaybackError;

  useEffect(() => {
    resume.current = null;
  }, [extra]);

  useEffect(() => {
    setPlaying(videoProps.autoPlay ?? false);
  }, [extra, videoProps.autoPlay]);

  useEffect(() => {
    let active = true;
    setDiscover(null);
    setError(null);
    if (extra.source === "discover")
      void resolveDiscoverExtra(extra)
        .then((source) => {
          if (active) setDiscover(source);
        })
        .catch((reason: unknown) => {
          if (active)
            setError(
              reason instanceof Error
                ? reason.message
                : "Plex Discover could not prepare this extra. Please try again.",
            );
        });
    return () => {
      active = false;
    };
  }, [extra, attempt]);

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
        position: "relative",
      }}
    >
      {!source && !failure && <CircularProgress />}
      {failure && showErrors && (
        <Alert
          severity="error"
          action={
            extra.source === "discover" ? (
              <Button color="inherit" onClick={() => setAttempt((value) => value + 1)}>
                Try again
              </Button>
            ) : undefined
          }
        >
          {failure}
        </Alert>
      )}
      {local.subtitleError && showErrors && (
        <Alert
          severity="warning"
          sx={{ position: "absolute", top: 16, left: 16, right: 16, zIndex: 1 }}
        >
          {local.subtitleError}
        </Alert>
      )}
      {source && !failure && (
        <VideoPlayer
          {...videoProps}
          playing={videoProps.playing ?? playing}
          onPlay={() => {
            setPlaying(true);
            videoProps.onPlay?.();
          }}
          onPause={() => {
            setPlaying(false);
            videoProps.onPause?.();
          }}
          onPlayRejected={() => {
            setPlaying(false);
            videoProps.onPlayRejected?.();
          }}
          controls={controls}
          ref={player}
          source={source}
          startTime={resume.current ?? videoProps.startTime}
          onReady={(sourceId) => {
            if (extra.source === "local" && !local.reportReady(sourceId)) return;
            videoProps.onReady?.(sourceId);
          }}
          onError={(reason) => {
            if (reason.sourceId !== source.id) return;
            if (extra.source === "local" && !local.reportError(reason)) return;
            if (
              reason.position !== undefined ||
              (player.current && player.current.getDuration() > 0)
            )
              resume.current = reason.position ?? player.current!.getCurrentTime();
            if (extra.source === "discover") setError(reason.message);
          }}
          onSubtitleError={(reason) => {
            if (reason.sourceId !== source.id) return;
            if (extra.source === "local") local.reportSubtitleError(reason);
            videoProps.onSubtitleError?.(reason);
          }}
        />
      )}
    </Box>
  );
}
