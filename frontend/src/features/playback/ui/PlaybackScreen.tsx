import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { getTranscodeImageURL } from "plex";
import CenteredSpinner from "components/CenteredSpinner";
import {
  alpha,
  Box,
  Button,
  Fade,
  IconButton,
  Paper,
  Popover,
  Slider,
  Typography,
  useTheme,
} from "@mui/material";
import ReactPlayer from "react-player";
import {
  ArrowBackIosNewRounded,
  FullscreenRounded,
  PauseRounded,
  PeopleRounded,
  PlayArrowRounded,
  SkipNext,
  TuneRounded,
  VolumeUpRounded,
} from "@mui/icons-material";
import { VideoSeekSlider } from "react-video-seek-slider";
import "react-video-seek-slider/styles.css";
import { useWatchTogetherPlayback } from "features/watch-together/public";
import EpisodeBrowser from "./EpisodeBrowser";
import { useUserSettings } from "states/UserSettingsState";
import NextEpisodeOverlay from "./NextEpisodeOverlay";
import AppDialog from "components/AppDialog";
import { formatPlaybackTime } from "../model/playbackPresentation";
import { usePlaybackCommands } from "../model/usePlaybackCommands";
import { usePlaybackMedia } from "../model/usePlaybackMedia";
import { usePlaybackRuntime } from "../model/usePlaybackRuntime";
import { usePlaybackTimeline } from "../model/usePlaybackTimeline";
import NextQueueButton from "./NextQueueButton";
import PlaybackInfoOverlay from "./PlaybackInfoOverlay";
import PlaybackSettingsPopover from "./PlaybackSettingsPopover";

function PlaybackScreen() {
  const { itemID } = useParams<{ itemID: string }>();
  const [params] = useSearchParams();
  const theme = useTheme();
  const navigate = useNavigate();

  const { settings } = useUserSettings();
  const player = useRef<ReactPlayer | null>(null);
  const playbackRuntime = usePlaybackRuntime({
    getPlayer: () => player.current,
  });
  const {
    playing,
    progress,
    buffered,
    buffering,
    volume,
  } = playbackRuntime;

  const [volumePopoverAnchor, setVolumePopoverAnchor] =
    useState<HTMLButtonElement | null>(null);
  const volumePopoverOpen = Boolean(volumePopoverAnchor);

  const [showTune, setShowTune] = useState(false);
  const tuneButtonRef = useRef<HTMLButtonElement | null>(null);
  const playbackBarRef = useRef<HTMLDivElement | null>(null);
  const [showError, setShowError] = useState<string | false>(false);

  const playbackMedia = usePlaybackMedia({
    itemID,
    getCurrentTime: playbackRuntime.getCurrentTime,
    onSourceChanging: playbackRuntime.sourceChanging,
    requestResumeAt: playbackRuntime.requestResumeAt,
    setError: setShowError,
  });
  const {
    metadata,
    showMetadata,
    playQueue,
    url,
    activeVersion,
  } = playbackMedia;

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

  const [controlElementsVisible, setControlElementsVisible] = useState(false);

  useEffect(() => {
    setControlElementsVisible(volumePopoverOpen || showTune);
  }, [volumePopoverOpen, showTune]);

  const [showControls, setShowControls] = useState(true);
  useEffect(() => {
    let timeout: number;
    let whenMouseMoves = () => {
      clearTimeout(timeout);
      setShowControls(true);
      timeout = setTimeout(() => {
        setShowControls(false);
      }, 5000);
    };

    document.addEventListener("mousemove", whenMouseMoves);
    return () => {
      clearTimeout(timeout);
      document.removeEventListener("mousemove", whenMouseMoves);
    };
  }, [playing]);

  const [showInfo, setShowInfo] = useState(false);
  useEffect(() => {
    if (playing) {
      setShowInfo(false);
      return;
    }

    const timeout = window.setTimeout(() => setShowInfo(true), 5000);
    return () => window.clearTimeout(timeout);
  }, [playing]);

  useEffect(() => {
    if (!playing) return;

    if (showControls) document.body.style.cursor = "default";
    else document.body.style.cursor = "none";

    return () => {
      document.body.style.cursor = "default";
    };
  }, [playing, showControls]);

  useEffect(() => {
    const style = document.createElement("style");
    style.innerHTML = `
      .ui-video-seek-slider .track .main .connect {
        background-color: ${theme.palette.primary.main};
      }
      .ui-video-seek-slider .thumb .handler {
        background-color: ${theme.palette.primary.main};
      }
    `;
    document.head.appendChild(style);
    return () => {
      style.remove();
    };
  }, [theme.palette.primary.main]);

  return (
    <>
      <AppDialog
        open={showError !== false}
        title="Playback error"
        size="compact"
        onClose={() => setShowError(false)}
        actions={
          <>
            <Button
              variant="outlined"
              color="primary"
              onClick={() => {
                setShowError(false);

                if (player.current?.getCurrentTime() ?? 0 > 5) {
                  const url = new URL(window.location.href);
                  url.searchParams.set(
                    "t",
                    Math.floor(
                      (player.current?.getCurrentTime() ?? 0) * 1000,
                    ).toString(),
                  );
                  window.location.href = url.toString();
                } else window.location.reload();
              }}
            >
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
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            overflow: "hidden",
            pointerEvents: "none",
          }}
        >
          <CenteredSpinner />
        </Box>
        {metadata && (
          <PlaybackInfoOverlay
            metadata={metadata}
            showMetadata={showMetadata}
            visible={showInfo}
          />
        )}

        <PlaybackSettingsPopover
          open={showTune}
          anchorEl={tuneButtonRef.current}
          media={playbackMedia}
          onClose={() => setShowTune(false)}
        />
        {(() => {
          if (!metadata) return <CenteredSpinner />;

          return (
            <>
              <Fade
                mountOnEnter
                unmountOnExit
                in={
                  !isGuest &&
                  metadata.Marker &&
                  metadata.Marker.filter(
                    (marker) =>
                      marker.startTimeOffset / 1000 <= progress &&
                      marker.endTimeOffset / 1000 >= progress &&
                      marker.type === "intro",
                  ).length > 0
                }
              >
                <Box
                  sx={{
                    position: "absolute",
                    bottom: `${
                      (playbackBarRef.current?.clientHeight ?? 0) + 40
                    }px`,
                    right: "40px",
                    zIndex: 2,
                  }}
                >
                  <Button
                    sx={{
                      px: 3,
                      py: 1.5,
                      backgroundColor: "rgba(0,0,0,0.8)",
                      backdropFilter: "blur(20px)",
                      border: `1px solid ${alpha(theme.palette.divider, 0.3)}`,
                      color: "#fff",
                      "&:hover": {
                        backgroundColor: "rgba(0,0,0,0.9)",
                        transform: "translateY(-2px)",
                        boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
                        border: `1px solid ${alpha(
                          theme.palette.primary.main,
                          0.5,
                        )}`,
                      },
                    }}
                    variant="contained"
                    onClick={() => {
                      if (!metadata.Marker) return;
                      const time =
                        metadata.Marker?.filter(
                          (marker) =>
                            marker.startTimeOffset / 1000 <= progress &&
                            marker.endTimeOffset / 1000 >= progress &&
                            marker.type === "intro",
                        )[0].endTimeOffset / 1000;
                      playbackCommands.seekTo(time + 1);
                    }}
                  >
                    <Box
                      sx={{
                        display: "flex",
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 1.5,
                      }}
                    >
                      <SkipNext sx={{ fontSize: 18 }} />
                      <Typography
                        sx={{
                          fontSize: "0.875rem",
                          fontWeight: 600,
                          letterSpacing: "0.025em",
                        }}
                      >
                        Skip Intro
                      </Typography>
                    </Box>
                  </Button>
                </Box>
              </Fade>

              <Fade
                mountOnEnter
                unmountOnExit
                in={
                  !isGuest &&
                  metadata.Marker &&
                  metadata.Marker.filter(
                    (marker) =>
                      marker.startTimeOffset / 1000 <= progress &&
                      marker.endTimeOffset / 1000 >= progress &&
                      marker.type === "credits" &&
                      !marker.final,
                  ).length > 0
                }
              >
                <Box
                  sx={{
                    position: "absolute",
                    bottom: `${
                      (playbackBarRef.current?.clientHeight ?? 0) + 40
                    }px`,
                    right: "40px",
                    zIndex: 2,
                  }}
                >
                  <Button
                    sx={{
                      px: 3,
                      py: 1.5,
                      backgroundColor: "rgba(0,0,0,0.8)",
                      backdropFilter: "blur(20px)",
                      border: `1px solid ${alpha(theme.palette.divider, 0.3)}`,
                      color: "#fff",
                      "&:hover": {
                        backgroundColor: "rgba(0,0,0,0.9)",
                        transform: "translateY(-2px)",
                        boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
                        border: `1px solid ${alpha(
                          theme.palette.primary.main,
                          0.5,
                        )}`,
                      },
                    }}
                    variant="contained"
                    onClick={() => {
                      if (!metadata.Marker) return;
                      const time =
                        metadata.Marker?.filter(
                          (marker) =>
                            marker.startTimeOffset / 1000 <= progress &&
                            marker.endTimeOffset / 1000 >= progress &&
                            marker.type === "credits" &&
                            !marker.final,
                        )[0].endTimeOffset / 1000;
                      playbackCommands.seekTo(time + 1);
                    }}
                  >
                    <Box
                      sx={{
                        display: "flex",
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 1.5,
                      }}
                    >
                      <SkipNext sx={{ fontSize: 18 }} />
                      <Typography
                        sx={{
                          fontSize: "0.875rem",
                          fontWeight: 600,
                          letterSpacing: "0.025em",
                        }}
                      >
                        Skip Credits
                      </Typography>
                    </Box>
                  </Button>
                </Box>
              </Fade>

              <Fade
                mountOnEnter
                unmountOnExit
                in={
                  !isGuest &&
                  metadata.Marker &&
                  metadata.Marker.filter(
                    (marker) =>
                      marker.startTimeOffset / 1000 <= progress &&
                      marker.endTimeOffset / 1000 >= progress &&
                      marker.type === "credits" &&
                      marker.final,
                  ).length > 0
                }
              >
                <Box
                  sx={{
                    position: "absolute",
                    bottom: `${
                      (playbackBarRef.current?.clientHeight ?? 0) + 40
                    }px`,
                    right: "40px",
                    zIndex: 2,
                  }}
                >
                  <NextEpisodeOverlay
                    metadata={metadata}
                    playQueue={playQueue}
                    playing={playing}
                    onAdvance={playbackCommands.advanceFromCredits}
                  />
                </Box>
              </Fade>

              <Fade
                in={showControls || !playing || controlElementsVisible}
                style={{
                  transitionDuration: "1s",
                }}
              >
                <Box
                  sx={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    zIndex: 1,
                    width: "100vw",
                    height: "100vh",
                    display: "flex",
                    flexDirection: "column",
                    overflow: "hidden",
                    background:
                      settings["DISABLE_WATCHSCREEN_DARKENING"] === "true"
                        ? "transparent"
                        : "linear-gradient(180deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.3) 40%, rgba(0,0,0,0.3) 60%, rgba(0,0,0,0.8) 100%)",
                    pointerEvents: "none",
                  }}
                >
                  <Box
                    sx={{
                      mt: 3,
                      mx: 3,
                      display: "flex",
                      flexDirection: "row",
                      justifyContent: "flex-start",
                      alignItems: "center",
                      pointerEvents: "all",
                    }}
                  >
                    <IconButton
                      onClick={playbackCommands.exitPlayback}
                      sx={{
                        width: 48,
                        height: 48,
                        backgroundColor: "rgba(0,0,0,0.6)",
                        backdropFilter: "blur(20px)",
                        border: `1px solid ${alpha(
                          theme.palette.divider,
                          0.2,
                        )}`,
                        "&:hover": {
                          backgroundColor: "rgba(0,0,0,0.8)",
                          transform: "scale(1.05)",
                        },
                      }}
                    >
                      <ArrowBackIosNewRounded fontSize="medium" />
                    </IconButton>
                  </Box>

                  {/* Standalone Backdrop Blur Background */}
                  <Box
                    sx={{
                      position: "absolute",
                      left: 0,
                      right: 0,
                      height: playbackBarRef.current?.clientHeight || 200,
                      background:
                        "linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.9) 100%)",
                      backdropFilter: "blur(20px)",
                      WebkitBackdropFilter: "blur(20px)",
                      zIndex: -1,
                      borderTop: `1px solid ${alpha(
                        theme.palette.divider,
                        0.1,
                      )}`,
                      transition: "bottom 0.5s ease",
                    }}
                    style={{
                      bottom:
                        showControls || !playing
                          ? 0
                          : -(playbackBarRef.current?.clientHeight || 200),
                    }}
                  />

                  <Box
                    ref={playbackBarRef}
                    sx={{
                      mt: "auto",
                      mb: 0,
                      mx: 0,
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                      alignItems: "center",
                      pointerEvents: "all",
                      px: 4,
                      py: 2,

                      transition: "transform 0.5s ease",
                    }}
                    style={{
                      transform:
                        showControls || !playing
                          ? "translateY(0)"
                          : "translateY(100%)",
                    }}
                  >
                    {/* Progress Bar Section */}
                    <Box
                      sx={{
                        width: "100%",
                        display: "flex",
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 3,
                        mb: 2,
                      }}
                    >
                      <Typography
                        variant="caption"
                        sx={{
                          minWidth: "45px",
                          textAlign: "center",
                          fontSize: "0.75rem",
                          color: "rgba(255,255,255,0.8)",
                          fontWeight: 500,
                        }}
                      >
                        {formatPlaybackTime(progress)}
                      </Typography>

                      <Box
                        sx={{
                          flex: 1,
                          height: "18px",
                          position: "relative",
                        }}
                      >
                        <VideoSeekSlider
                          max={(player.current?.getDuration() ?? 0) * 1000}
                          currentTime={progress * 1000}
                          bufferTime={buffered * 1000}
                          onChange={(value) =>
                            playbackCommands.seekTo(value / 1000)
                          }
                          getPreviewScreenUrl={(value) => {
                            if (!activeVersion?.part.indexes) return "";
                            return getTranscodeImageURL(
                              `/library/parts/${activeVersion.part.id}/indexes/sd/${value}`,
                              240,
                              135,
                            );
                          }}
                        />
                      </Box>

                      <Typography
                        variant="caption"
                        sx={{
                          minWidth: "45px",
                          textAlign: "center",
                          fontSize: "0.75rem",
                          color: "rgba(255,255,255,0.8)",
                          fontWeight: 500,
                        }}
                      >
                        {formatPlaybackTime(
                          (player.current?.getDuration() ?? 0) - progress,
                        )}
                      </Typography>
                    </Box>

                    {/* Controls Section */}
                    <Box
                      sx={{
                        display: "flex",
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                        width: "100%",
                      }}
                    >
                      {/* Left Controls */}
                      <Box
                        sx={{
                          display: "flex",
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 1,
                        }}
                      >
                        <IconButton
                          onClick={playbackCommands.togglePlayback}
                          onKeyDown={(e) => {
                            e.preventDefault();
                          }}
                          sx={{
                            width: 48,
                            height: 48,
                            backgroundColor: "rgba(255,255,255,0.1)",
                            "&:hover": {
                              backgroundColor: "rgba(255,255,255,0.2)",
                              transform: "scale(1.05)",
                            },
                          }}
                        >
                          {playing ? (
                            <PauseRounded fontSize="medium" />
                          ) : (
                            <PlayArrowRounded fontSize="medium" />
                          )}
                        </IconButton>

                        {playQueue && !isGuest && (
                          <NextQueueButton queue={playQueue} />
                        )}
                      </Box>

                      {/* Center Title */}
                      <Box
                        sx={{
                          flex: 1,
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "center",
                          textAlign: "center",
                          mx: 4,
                        }}
                      >
                        {metadata.type === "movie" && (
                          <Typography
                            variant="h6"
                            sx={{
                              fontSize: "1rem",
                              fontWeight: 600,
                              color: "#fff",
                              textOverflow: "ellipsis",
                              overflow: "hidden",
                              whiteSpace: "nowrap",
                              maxWidth: "100%",
                            }}
                          >
                            {metadata.title}
                          </Typography>
                        )}

                        {metadata.type === "episode" && (
                          <>
                            <Typography
                              variant="body2"
                              sx={{
                                fontSize: "0.75rem",
                                color: "rgba(255,255,255,0.7)",
                                textOverflow: "ellipsis",
                                overflow: "hidden",
                                whiteSpace: "nowrap",
                                maxWidth: "100%",
                              }}
                            >
                              {metadata.grandparentTitle}
                            </Typography>
                            <Typography
                              variant="h6"
                              sx={{
                                fontSize: "0.9rem",
                                fontWeight: 600,
                                color: "#fff",
                                textOverflow: "ellipsis",
                                overflow: "hidden",
                                whiteSpace: "nowrap",
                                maxWidth: "100%",
                                mt: 0.5,
                              }}
                            >
                              S{metadata.parentIndex}E{metadata.index} •{" "}
                              {metadata.title}
                            </Typography>
                          </>
                        )}
                      </Box>

                      {/* Right Controls */}
                      <Box
                        sx={{
                          display: "flex",
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 1,
                        }}
                      >
                        <IconButton
                          onKeyDown={(e) => {
                            e.preventDefault();
                          }}
                          onClick={(event) => {
                            setVolumePopoverAnchor(event.currentTarget);
                          }}
                          sx={{
                            width: 40,
                            height: 40,
                          }}
                        >
                          <VolumeUpRounded fontSize="small" />
                        </IconButton>

                        {metadata.type === "episode" && !isGuest && (
                          <EpisodeBrowser
                            item={metadata}
                            controlElementsVisibleState={[
                              controlElementsVisible,
                              setControlElementsVisible,
                            ]}
                          />
                        )}

                        <IconButton
                          onKeyDown={(e) => {
                            e.preventDefault();
                          }}
                          onClick={(event) => {
                            setShowTune(!showTune);
                            tuneButtonRef.current = event.currentTarget;
                          }}
                        >
                          <TuneRounded fontSize="small" />
                        </IconButton>

                        {room && (
                          <IconButton
                            onKeyDown={(e) => {
                              e.preventDefault();
                            }}
                            onClick={() => {
                              openTogetherDialog();
                            }}
                          >
                            <PeopleRounded fontSize="small" />
                          </IconButton>
                        )}

                        <IconButton
                          onKeyDown={(e) => {
                            e.preventDefault();
                          }}
                          onClick={playbackCommands.toggleFullscreen}
                        >
                          <FullscreenRounded fontSize="small" />
                        </IconButton>
                      </Box>
                    </Box>

                    {/* Volume Popover */}
                    <Popover
                      open={volumePopoverOpen}
                      anchorEl={volumePopoverAnchor}
                      onClose={() => {
                        setVolumePopoverAnchor(null);
                      }}
                      anchorOrigin={{
                        vertical: "top",
                        horizontal: "center",
                      }}
                      transformOrigin={{
                        vertical: "bottom",
                        horizontal: "center",
                      }}
                      elevation={0}
                      sx={{
                        userSelect: "none",
                        "& .MuiPaper-root": {
                          overflow: "hidden",
                          borderRadius: 1,
                          background: "transparent",
                        },
                      }}
                    >
                      <Paper
                        sx={{
                          height: "auto",
                          userSelect: "none",
                          backgroundColor: "#00000088",
                          backdropFilter: "blur(20px)",
                          border: `1px solid ${alpha(
                            theme.palette.divider,
                            0.1,
                          )}`,
                          py: 3,
                          px: 2,
                        }}
                      >
                        <Slider
                          sx={{
                            height: "100px",
                            "& .MuiSlider-thumb": {
                              width: 16,
                              height: 16,
                              backgroundColor: theme.palette.primary.main,
                              border: "2px solid rgba(255,255,255,0.3)",
                            },
                            "& .MuiSlider-track": {
                              backgroundColor: theme.palette.primary.main,
                              border: "none",
                              width: 4,
                            },
                            "& .MuiSlider-rail": {
                              backgroundColor: "rgba(255,255,255,0.2)",
                              width: 4,
                            },
                          }}
                          value={volume}
                          onChange={(_event, value) =>
                            playbackRuntime.setVolume(value as number)
                          }
                          aria-labelledby="continuous-slider"
                          min={0}
                          max={100}
                          step={1}
                          orientation="vertical"
                        />
                      </Paper>
                    </Popover>
                  </Box>
                </Box>
              </Fade>

              <ReactPlayer
                ref={player}
                playing={playing}
                volume={volume / 100}
                progressInterval={500}
                onClick={(e: MouseEvent) => {
                  e.preventDefault();
                  playbackCommands.handleSurfaceClick(e.detail);
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
                onError={(err) => {
                  console.log("Player error:");
                  console.error(err);
                  // window.location.reload();

                  playbackRuntime.setPlaying(false);
                  pauseTogether();
                  if (showError) return;

                  // filter out links from the error messages
                  if (!err.error) return;
                  const message = err.error.message.replace(
                    /https?:\/\/[^\s]+/g,
                    "Media",
                  );

                  setShowError(message);
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
          );
        })()}
      </Box>
    </>
  );
}

export default PlaybackScreen;
