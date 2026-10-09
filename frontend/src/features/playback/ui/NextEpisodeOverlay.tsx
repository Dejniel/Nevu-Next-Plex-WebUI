import type { PlaybackQueueItem } from "entities/media/model";
import { SkipNext } from "@mui/icons-material";
import { alpha, Box, Button, Typography, useTheme } from "@mui/material";
import { useState, useEffect } from "react";
import { useUserSettings } from "features/settings/model";

function NextEpisodeOverlay({
  playing,
  metadata,
  playQueue,
  onAdvance,
}: {
  playing: boolean;
  metadata: Plex.Metadata;
  playQueue: PlaybackQueueItem[] | null;
  onAdvance: () => void;
}) {
  const theme = useTheme();
  const [countdown, setCountdown] = useState<number | null>(null);
  const [showWatchCredits, setShowWatchCredits] = useState(false);
  const countdownDuration = metadata.type === "movie" ? 30 : 5;

  const enableAutoNext =
    useUserSettings.getState().settings.AUTO_NEXT_EP === "true";

  // Start countdown when a next episode is available
  useEffect(() => {
    if (metadata?.Marker && playQueue && playQueue[1]) {
      setCountdown(countdownDuration);
      setShowWatchCredits(true);
    }
  }, [metadata, playQueue, countdownDuration]);

  const handleWatchCredits = () => {
    setCountdown(null);
    setShowWatchCredits(false);
  };

  // Handle countdown timer
  useEffect(() => {
    if (countdown === null || !showWatchCredits || !playing || !enableAutoNext)
      return;

    if (countdown <= 0) {
      // Auto-navigate when timer reaches 0
      onAdvance();
      return;
    }

    const timer = setTimeout(() => {
      setCountdown((prev) => (prev !== null ? prev - 0.05 : null));
    }, 50);

    return () => clearTimeout(timer);
  }, [countdown, showWatchCredits, playing, enableAutoNext, onAdvance]);

  // Calculate progress percentage
  const progressPercentage =
    countdown !== null
      ? ((countdownDuration - countdown) / countdownDuration) * 100
      : 0;

  return (
    <Box sx={{ display: "flex", gap: 2 }}>
      {showWatchCredits && countdown !== null && countdown > 0 && (
        <Button
          sx={{
            px: 2,
            py: 1.5,
            backgroundColor: "rgba(255,255,255,0.1)",
            backdropFilter: "blur(20px)",
            border: `1px solid ${alpha(theme.palette.divider, 0.3)}`,
            color: "#fff",
            "&:hover": {
              backgroundColor: "rgba(255,255,255,0.2)",
              transform: "translateY(-2px)",
              boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
            },
          }}
          variant="outlined"
          onClick={handleWatchCredits}
        >
          <Typography
            sx={{
              fontSize: "0.875rem",
              fontWeight: 600,
              letterSpacing: "0.025em",
            }}
          >
            Watch Credits
          </Typography>
        </Button>
      )}

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
        style={{
          background: `linear-gradient(90deg, 
          ${theme.palette.primary.main} ${progressPercentage}%, 
          rgba(0,0,0,0.8) ${progressPercentage}%)`,
        }}
        variant="contained"
        onClick={onAdvance}
      >
        <Box
          sx={{
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            transition: "all 0.25s",
            gap: 1,
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
            {metadata.type === "movie"
              ? "Skip Credits"
              : playQueue && playQueue[1]
                ? "Next Episode"
                : "Return to Show"}
            {countdown !== null && countdown > 0 && (
              <span style={{ marginLeft: "8px" }}>
                ({Math.ceil(countdown)}s)
              </span>
            )}
          </Typography>
        </Box>
      </Button>
    </Box>
  );
}

export default NextEpisodeOverlay;
