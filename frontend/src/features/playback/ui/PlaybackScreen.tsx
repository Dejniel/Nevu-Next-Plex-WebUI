import { Alert, Box, Button, Typography } from "@mui/material";
import {
  parsePlaylistContext,
  type PlaylistPlaybackContext,
} from "features/media-lists/model";
import { AppDialog, CenteredSpinner, VideoPlayer } from "shared/ui";
import { useWatchTogetherPlayback } from "features/watch-together/public";
import React, { useEffect, useRef, useState } from "react";
import type { VideoPlayerHandle } from "shared/lib/video/types";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { usePlaybackCommands } from "../model/usePlaybackCommands";
import { usePlaybackMedia } from "../model/usePlaybackMedia";
import { usePlaybackRuntime } from "../model/usePlaybackRuntime";
import { usePlaybackTimeline } from "../model/usePlaybackTimeline";
import PlaybackControlsOverlay from "./PlaybackControlsOverlay";
import PlaybackInfoOverlay from "./PlaybackInfoOverlay";

function PlaybackSession({
  playlistContext,
}: {
  playlistContext?: PlaylistPlaybackContext;
}) {
  const { itemID } = useParams<{ itemID: string }>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const player = useRef<VideoPlayerHandle | null>(null);
  const surface = useRef<HTMLDivElement | null>(null);
  const [showError, setShowError] = useState<string | false>(false);

  const playbackRuntime = usePlaybackRuntime({
    getPlayer: () => player.current,
    itemID,
  });
  const { playing, buffering, volume, setPlaying } = playbackRuntime;
  const playbackMedia = usePlaybackMedia({
    itemID,
    playlistContext,
    getCurrentTime: playbackRuntime.getCurrentTime,
    onSourceChanging: playbackRuntime.sourceChanging,
    requestResumeAt: playbackRuntime.requestResumeAt,
    setError: setShowError,
  });
  const { metadata, showMetadata, playQueue, source } = playbackMedia;
  const resumeMilliseconds = params.has("t")
    ? Number.parseInt(params.get("t") as string, 10)
    : metadata?.viewOffset && metadata.viewOffset > 5
      ? metadata.viewOffset
      : 0;
  const initialResumeSeconds = Number.isFinite(resumeMilliseconds)
    ? Math.max(0, resumeMilliseconds / 1000)
    : null;

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
      setPlaying(false);
      pauseTogether();
    },
    source: metadata?.ratingKey === itemID ? source : null,
  });
  const playbackCommands = usePlaybackCommands({
    metadata,
    playQueue,
    playlistContext,
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
    getSurface: () => surface.current,
    enabled: !showError,
  });

  useEffect(() => {
    if (showError) {
      setPlaying(false);
      pauseTogether();
    }
  }, [showError, setPlaying, pauseTogether]);

  useEffect(() => {
    surface.current?.focus({ preventScroll: true });
  }, [itemID]);

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
    if (playbackRuntime.getDuration() > 0)
      playbackRuntime.requestResumeAt(playbackRuntime.getCurrentTime());
    playbackRuntime.setPlaying(true);
    playbackMedia.reloadSource();
  };

  return (
    <>
      {(playbackMedia.queueError || playbackMedia.subtitleError) && (
        <Box
          sx={{
            position: "absolute",
            top: 16,
            left: 16,
            right: 16,
            zIndex: 30,
            display: "flex",
            flexDirection: "column",
            gap: 1,
          }}
        >
          {playbackMedia.queueError && (
            <Alert
              severity="warning"
              action={
                <Button color="inherit" onClick={playbackMedia.reloadQueue}>
                  Retry
                </Button>
              }
            >
              {playbackMedia.queueError}
            </Alert>
          )}
          {playbackMedia.subtitleError && (
            <Alert severity="warning">{playbackMedia.subtitleError}</Alert>
          )}
        </Box>
      )}
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
        ref={surface}
        tabIndex={-1}
        onPointerDown={(event) => {
          if (
            event.target === event.currentTarget ||
            event.target instanceof HTMLVideoElement
          )
            surface.current?.focus({ preventScroll: true });
        }}
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
          width: "100%",
          overflow: "hidden",
          position: "relative",
          bgcolor: "#000",
          outline: "none",
        }}
      >
        <Box
          sx={{
            display: buffering || playbackMedia.sourceLoading ? "flex" : "none",
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
              getSurface={() => surface.current}
              watch={{
                room,
                isGuest,
                openDialog: openTogetherDialog,
              }}
            />
            <VideoPlayer
              ref={player}
              source={source}
              playing={playing}
              volume={volume / 100}
              startTime={playbackRuntime.getResumePosition(
                itemID,
                initialResumeSeconds,
              )}
              onClick={(event) => {
                event.preventDefault();
                playbackCommands.handleSurfaceClick(event.detail);
              }}
              onReady={(sourceId) => {
                if (playbackMedia.reportSourceReady(sourceId))
                  playbackRuntime.handleReady(itemID, initialResumeSeconds);
              }}
              onProgress={playbackRuntime.handleProgress}
              onPause={() => playbackRuntime.setPlaying(false)}
              onPlay={() => playbackRuntime.setPlaying(true)}
              onBuffering={playbackRuntime.setBuffering}
              onPlayRejected={() => playbackRuntime.setPlaying(false)}
              onSubtitleError={playbackMedia.reportSubtitleError}
              onError={(error) => {
                if (playbackMedia.reportSourceError(error)) {
                  if (
                    error.position !== undefined ||
                    playbackRuntime.getDuration() > 0
                  )
                    playbackRuntime.requestResumeAt(
                      error.position ?? playbackRuntime.getCurrentTime(),
                    );
                }
              }}
              onEnded={playbackCommands.handleEnded}
            />
          </>
        ) : (
          <CenteredSpinner />
        )}
      </Box>
    </>
  );
}

export default function PlaybackScreen() {
  const [params] = useSearchParams();
  const playlistContext = parsePlaylistContext(params);
  return (
    <PlaybackSession
      key={
        playlistContext
          ? `${playlistContext.id}:${playlistContext.index}:${playlistContext.itemID ?? ""}`
          : "standalone"
      }
      playlistContext={playlistContext}
    />
  );
}
