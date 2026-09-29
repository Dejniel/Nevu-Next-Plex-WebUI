import { Box, Button, Typography } from "@mui/material";
import CenteredSpinner from "components/CenteredSpinner";
import { useWatchTogetherPlayback } from "features/watch-together/public";
import React, { useEffect, useRef, useState } from "react";
import ReactPlayer from "react-player";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import AppDialog from "components/AppDialog";
import { usePlaybackCommands } from "../model/usePlaybackCommands";
import { usePlaybackMedia } from "../model/usePlaybackMedia";
import { usePlaybackRuntime } from "../model/usePlaybackRuntime";
import { usePlaybackTimeline } from "../model/usePlaybackTimeline";
import PlaybackControlsOverlay from "./PlaybackControlsOverlay";
import PlaybackInfoOverlay from "./PlaybackInfoOverlay";

function PlaybackScreen() {
  const { itemID } = useParams<{ itemID: string }>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const player = useRef<ReactPlayer | null>(null);
  const [showError, setShowError] = useState<string | false>(false);

  const playbackRuntime = usePlaybackRuntime({
    getPlayer: () => player.current,
  });
  const { playing, buffering, volume } = playbackRuntime;
  const playbackMedia = usePlaybackMedia({
    itemID,
    getCurrentTime: playbackRuntime.getCurrentTime,
    onSourceChanging: playbackRuntime.sourceChanging,
    requestResumeAt: playbackRuntime.requestResumeAt,
    setError: setShowError,
  });
  const { metadata, showMetadata, playQueue, url } = playbackMedia;

  const {
    room,
    isGuest,
    pause: pauseTogether,
    resume: resumeTogether,
    seek: seekTogether,
    end: endTogether,
    leave: leaveTogether,
    openDialog: openTogetherDialog,
  } = useWatchTogetherPlayback({
    itemID,
    playing,
    getCurrentTime: playbackRuntime.getCurrentTime,
    seekTo: playbackRuntime.seekToLocal,
    setPlaying: playbackRuntime.setPlaying,
    openRemotePlayback: (state) => {
      if (!state.key) return;
      const time = state.time === undefined ? "" : `?t=${state.time}`;
      navigate(`/watch/${state.key}${time}`);
    },
    onRemotePlaybackEnd: () => navigate("/sync/waitingroom"),
  });

  const playbackTimeline = usePlaybackTimeline({
    itemID,
    playing,
    buffering,
    getCurrentTime: playbackRuntime.getCurrentTime,
    getDuration: playbackRuntime.getDuration,
    onTermination: (message) => {
      setShowError(message);
      playbackRuntime.setPlaying(false);
      pauseTogether();
    },
  });
  const playbackCommands = usePlaybackCommands({
    metadata,
    playQueue,
    isGuest,
    runtime: playbackRuntime,
    sync: {
      pause: pauseTogether,
      resume: resumeTogether,
      seek: seekTogether,
      end: endTogether,
      leave: leaveTogether,
    },
    navigate,
    reportStopped: playbackTimeline.reportStopped,
  });

  const [showInfo, setShowInfo] = useState(false);
  useEffect(() => {
    if (playing) {
      setShowInfo(false);
      return;
    }
    const timeout = window.setTimeout(() => setShowInfo(true), 5000);
    return () => window.clearTimeout(timeout);
  }, [playing]);

  const reloadPlayback = () => {
    setShowError(false);
    const currentTime = player.current?.getCurrentTime() ?? 0;
    if (currentTime <= 5) {
      window.location.reload();
      return;
    }
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set("t", Math.floor(currentTime * 1000).toString());
    window.location.href = nextUrl.toString();
  };

  return (
    <>
      <AppDialog
        open={showError !== false}
        title="Playback error"
        size="compact"
        onClose={() => setShowError(false)}
        actions={
          <>
            <Button variant="outlined" color="primary" onClick={reloadPlayback}>
              Reload
            </Button>
            <Button
              variant="outlined"
              color="secondary"
              onClick={() => {
                setShowError(false);
                playbackCommands.exitPlayback();
              }}
            >
              Home
            </Button>
          </>
        }
      >
        <Typography sx={{ textAlign: "center" }}>{showError}</Typography>
      </AppDialog>

      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
          width: "100%",
          overflow: "hidden",
        }}
      >
        <Box
          sx={{
            display: buffering ? "flex" : "none",
            zIndex: 2,
            position: "absolute",
            inset: 0,
            width: "100vw",
            height: "100vh",
            overflow: "hidden",
            pointerEvents: "none",
          }}
        >
          <CenteredSpinner />
        </Box>

        {metadata ? (
          <>
            <PlaybackInfoOverlay
              metadata={metadata}
              showMetadata={showMetadata}
              visible={showInfo}
            />
            <PlaybackControlsOverlay
              media={playbackMedia}
              runtime={playbackRuntime}
              commands={playbackCommands}
              watch={{
                room,
                isGuest,
                openDialog: openTogetherDialog,
              }}
            />
            <ReactPlayer
              ref={player}
              playing={playing}
              volume={volume / 100}
              progressInterval={500}
              onClick={(event: MouseEvent) => {
                event.preventDefault();
                playbackCommands.handleSurfaceClick(event.detail);
              }}
              onReady={() => {
                const resumeMilliseconds = params.has("t")
                  ? Number.parseInt(params.get("t") as string, 10)
                  : metadata.viewOffset && metadata.viewOffset > 5
                    ? metadata.viewOffset
                    : null;
                playbackRuntime.handleReady(
                  itemID,
                  resumeMilliseconds ? resumeMilliseconds / 1000 : null,
                );
              }}
              onProgress={playbackRuntime.handleProgress}
              onPause={() => playbackRuntime.setPlaying(false)}
              onPlay={() => playbackRuntime.setPlaying(true)}
              onBuffer={() => playbackRuntime.setBuffering(true)}
              onBufferEnd={() => playbackRuntime.setBuffering(false)}
              onError={(error) => {
                console.error("Player error:", error);
                playbackRuntime.setPlaying(false);
                pauseTogether();
                if (showError || !error.error) return;
                setShowError(
                  error.error.message.replace(/https?:\/\/[^\s]+/g, "Media"),
                );
              }}
              config={{
                file: {
                  hlsVersion: "1.6.7",
                  dashVersion: "4.7.4",
                  attributes: {
                    controlsList: "nodownload",
                    disablePictureInPicture: true,
                    disableRemotePlayback: true,
                    autoplay: true,
                  },
                },
              }}
              onEnded={playbackCommands.handleEnded}
              url={url}
              width="100%"
              height="100%"
            />
          </>
        ) : (
          <CenteredSpinner />
        )}
      </Box>
    </>
  );
}

export default PlaybackScreen;
