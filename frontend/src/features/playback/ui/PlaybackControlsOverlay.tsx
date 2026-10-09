import { overlayContainer } from "shared/lib/overlayContainer";
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
import {
  alpha,
  Box,
  Button,
  Fade,
  GlobalStyles,
  IconButton,
  Paper,
  Popover,
  Slider,
  Typography,
  useTheme,
} from "@mui/material";
import { useEffect, useRef, useState } from "react";
import { VideoSeekSlider } from "react-video-seek-slider";
import "react-video-seek-slider/styles.css";
import { getTranscodeImageURL } from "entities/media/model";
import { useUserSettings } from "features/settings/model";
import { activePlaybackMarker } from "../model/playbackNavigation";
import { formatPlaybackTime } from "../model/playbackPresentation";
import type { PlaybackCommandController } from "../model/usePlaybackCommands";
import type { PlaybackMediaController } from "../model/usePlaybackMedia";
import type { PlaybackRuntimeController } from "../model/usePlaybackRuntime";
import EpisodeBrowser from "./EpisodeBrowser";
import NextEpisodeOverlay from "./NextEpisodeOverlay";
import NextQueueButton from "./NextQueueButton";
import PlaybackSettingsPopover from "./PlaybackSettingsPopover";

interface PlaybackControlsWatch {
  room: string | null;
  isGuest: boolean;
  openDialog: () => void;
}

interface PlaybackControlsOverlayProps {
  media: PlaybackMediaController;
  runtime: PlaybackRuntimeController;
  commands: PlaybackCommandController;
  watch: PlaybackControlsWatch;
  getSurface: () => HTMLElement | null;
}

export default function PlaybackControlsOverlay({
  media,
  runtime,
  commands,
  watch,
  getSurface,
}: PlaybackControlsOverlayProps) {
  const theme = useTheme();
  const { settings } = useUserSettings();
  const [volumeAnchor, setVolumeAnchor] = useState<HTMLButtonElement | null>(
    null,
  );
  const [showTune, setShowTune] = useState(false);
  const [controlElementVisible, setControlElementVisible] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const tuneButtonRef = useRef<HTMLButtonElement | null>(null);
  const playbackBarRef = useRef<HTMLDivElement | null>(null);

  const { metadata, playQueue, activeVersion } = media;
  const { playing, progress, buffered, volume } = runtime;
  const volumeOpen = Boolean(volumeAnchor);

  useEffect(() => {
    setControlElementVisible(volumeOpen || showTune);
  }, [showTune, volumeOpen]);

  useEffect(() => {
    let timeout: number;
    const handleMouseMove = () => {
      window.clearTimeout(timeout);
      setShowControls(true);
      timeout = window.setTimeout(() => setShowControls(false), 5000);
    };

    const surface = getSurface();
    surface?.addEventListener("pointermove", handleMouseMove);
    handleMouseMove();
    return () => {
      window.clearTimeout(timeout);
      surface?.removeEventListener("pointermove", handleMouseMove);
    };
    // The routed playback surface remains mounted for this overlay's lifetime.
    // oxlint-disable-next-line react/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!playing) return;
    const surface = getSurface();
    if (surface) surface.style.cursor = showControls ? "default" : "none";
    return () => {
      if (surface) surface.style.cursor = "default";
    };
    // oxlint-disable-next-line react/exhaustive-deps
  }, [playing, showControls]);

  if (!metadata) return null;

  const activeMarker = watch.isGuest
    ? undefined
    : activePlaybackMarker(metadata, progress);
  const markerLabel =
    activeMarker?.type === "intro"
      ? "Skip Intro"
      : activeMarker?.type === "credits" && !activeMarker.final
        ? "Skip Credits"
        : null;
  const finalCredits = activeMarker?.type === "credits" && activeMarker.final;
  const controlsVisible = showControls || !playing || controlElementVisible;
  const duration = runtime.getDuration();

  return (
    <>
      <GlobalStyles
        styles={{
          ".ui-video-seek-slider .track .main .connect": {
            backgroundColor: theme.palette.primary.main,
          },
          ".ui-video-seek-slider .thumb .handler": {
            backgroundColor: theme.palette.primary.main,
          },
        }}
      />

      <PlaybackSettingsPopover
        open={showTune}
        anchorEl={tuneButtonRef.current}
        media={media}
        onClose={() => setShowTune(false)}
      />

      <Fade
        mountOnEnter
        unmountOnExit
        in={Boolean(markerLabel || finalCredits)}
      >
        <Box
          sx={{
            position: "absolute",
            bottom: `${(playbackBarRef.current?.clientHeight ?? 0) + 40}px`,
            right: 40,
            zIndex: 2,
          }}
        >
          {finalCredits ? (
            <NextEpisodeOverlay
              metadata={metadata}
              playQueue={playQueue}
              playing={playing}
              onAdvance={commands.advanceFromCredits}
            />
          ) : (
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
                  border: `1px solid ${alpha(theme.palette.primary.main, 0.5)}`,
                },
              }}
              variant="contained"
              onClick={() => {
                if (activeMarker)
                  commands.seekTo(activeMarker.endTimeOffset / 1000 + 1);
              }}
            >
              <Box
                sx={{
                  display: "flex",
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
                  {markerLabel}
                </Typography>
              </Box>
            </Button>
          )}
        </Box>
      </Fade>

      <Fade in={controlsVisible} style={{ transitionDuration: "1s" }}>
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            zIndex: 1,
            width: "100vw",
            height: "100vh",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            background:
              settings.DISABLE_WATCHSCREEN_DARKENING === "true"
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
              alignItems: "center",
              pointerEvents: "all",
            }}
          >
            <IconButton
              aria-label="Back"
              onClick={commands.exitPlayback}
              sx={{
                width: 48,
                height: 48,
                backgroundColor: "rgba(0,0,0,0.6)",
                backdropFilter: "blur(20px)",
                border: `1px solid ${alpha(theme.palette.divider, 0.2)}`,
                "&:hover": {
                  backgroundColor: "rgba(0,0,0,0.8)",
                  transform: "scale(1.05)",
                },
              }}
            >
              <ArrowBackIosNewRounded fontSize="medium" />
            </IconButton>
          </Box>

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
              borderTop: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
              transition: "bottom 0.5s ease",
            }}
            style={{
              bottom: controlsVisible
                ? 0
                : -(playbackBarRef.current?.clientHeight || 200),
            }}
          />

          <Box
            ref={playbackBarRef}
            sx={{
              mt: "auto",
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
              transform: controlsVisible ? "translateY(0)" : "translateY(100%)",
            }}
          >
            <Box
              sx={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 3,
                mb: 2,
              }}
            >
              <PlaybackTime value={progress} />
              <Box sx={{ flex: 1, height: 18, position: "relative" }}>
                <VideoSeekSlider
                  max={duration * 1000}
                  currentTime={progress * 1000}
                  bufferTime={buffered * 1000}
                  onChange={(value) => commands.seekTo(value / 1000)}
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
              <PlaybackTime value={duration - progress} />
            </Box>

            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                width: "100%",
              }}
            >
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <IconButton
                  aria-label={playing ? "Pause" : "Play"}
                  onClick={commands.togglePlayback}
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
                {playQueue && !watch.isGuest && (
                  <NextQueueButton
                    queue={playQueue}
                    onAdvance={() => commands.advance()}
                  />
                )}
              </Box>

              <PlaybackTitle metadata={metadata} />

              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <IconButton
                  aria-label="Volume"
                  onClick={(event) => setVolumeAnchor(event.currentTarget)}
                  sx={{ width: 40, height: 40 }}
                >
                  <VolumeUpRounded fontSize="small" />
                </IconButton>

                {metadata.type === "episode" && !watch.isGuest && (
                  <EpisodeBrowser
                    item={metadata}
                    controlElementsVisibleState={[
                      controlElementVisible,
                      setControlElementVisible,
                    ]}
                  />
                )}

                <IconButton
                  aria-label="Playback settings"
                  onClick={(event) => {
                    setShowTune((visible) => !visible);
                    tuneButtonRef.current = event.currentTarget;
                  }}
                >
                  <TuneRounded fontSize="small" />
                </IconButton>

                {watch.room && (
                  <IconButton
                    aria-label="Watch together"
                    onClick={watch.openDialog}
                  >
                    <PeopleRounded fontSize="small" />
                  </IconButton>
                )}

                <IconButton
                  aria-label="Fullscreen"
                  onClick={commands.toggleFullscreen}
                >
                  <FullscreenRounded fontSize="small" />
                </IconButton>
              </Box>
            </Box>

            <Popover
              container={overlayContainer}
              open={volumeOpen}
              anchorEl={volumeAnchor}
              onClose={() => setVolumeAnchor(null)}
              anchorOrigin={{ vertical: "top", horizontal: "center" }}
              transformOrigin={{ vertical: "bottom", horizontal: "center" }}
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
                  userSelect: "none",
                  backgroundColor: "#00000088",
                  backdropFilter: "blur(20px)",
                  border: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
                  py: 3,
                  px: 2,
                }}
              >
                <Slider
                  sx={{
                    height: 100,
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
                    runtime.setVolume(value as number)
                  }
                  aria-label="Volume"
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
    </>
  );
}

function PlaybackTime({ value }: { value: number }) {
  return (
    <Typography
      variant="caption"
      sx={{
        minWidth: 45,
        textAlign: "center",
        fontSize: "0.75rem",
        color: "rgba(255,255,255,0.8)",
        fontWeight: 500,
      }}
    >
      {formatPlaybackTime(Math.max(0, value))}
    </Typography>
  );
}

function PlaybackTitle({ metadata }: { metadata: Plex.Metadata }) {
  const titleStyle = {
    color: "#fff",
    textOverflow: "ellipsis",
    overflow: "hidden",
    whiteSpace: "nowrap",
    maxWidth: "100%",
  } as const;

  return (
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
          sx={{ ...titleStyle, fontSize: "1rem", fontWeight: 600 }}
        >
          {metadata.title}
        </Typography>
      )}
      {metadata.type === "episode" && (
        <>
          <Typography
            variant="body2"
            sx={{
              ...titleStyle,
              fontSize: "0.75rem",
              color: "rgba(255,255,255,0.7)",
            }}
          >
            {metadata.grandparentTitle}
          </Typography>
          <Typography
            variant="h6"
            sx={{
              ...titleStyle,
              fontSize: "0.9rem",
              fontWeight: 600,
              mt: 0.5,
            }}
          >
            S{metadata.parentIndex}E{metadata.index} • {metadata.title}
          </Typography>
        </>
      )}
    </Box>
  );
}
