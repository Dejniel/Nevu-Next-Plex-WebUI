import { Box, Typography, useTheme } from "@mui/material";
import { durationToText } from "shared/lib/duration";
import {
  type MediaMetadata,
  formatMediaRating,
  getPrimaryMediaRating,
  getTranscodeImageURL,
  mediaRatingLabel,
} from "entities/media/model";

function MediaFacts({ metadata }: { metadata: MediaMetadata }) {
  const rating = getPrimaryMediaRating(metadata);
  const facts = [
    metadata.year,
    rating
      ? `${mediaRatingLabel(rating)} ${formatMediaRating(rating.value)}`
      : null,
    metadata.duration ? durationToText(metadata.duration) : null,
  ].filter((value) => value !== undefined && value !== null && value !== "");

  return (
    <Box
      sx={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 2 }}
    >
      {facts.map((fact, index) => (
        <Typography
          key={`${fact}:${index}`}
          sx={{ fontSize: "0.8vw", color: "rgba(255,255,255,0.7)" }}
        >
          {fact}
        </Typography>
      ))}
      {metadata.contentRating && (
        <Typography
          sx={{
            fontSize: "0.7vw",
            fontWeight: 500,
            color: "rgba(255,255,255,0.9)",
            border: "1px solid rgba(255,255,255,0.3)",
            borderRadius: 1,
            px: 1,
            py: 0.3,
          }}
        >
          {metadata.contentRating}
        </Typography>
      )}
    </Box>
  );
}

export default function PlaybackInfoOverlay({
  metadata,
  showMetadata,
  visible,
}: {
  metadata: MediaMetadata;
  showMetadata: MediaMetadata | null;
  visible: boolean;
}) {
  const theme = useTheme();
  const isEpisode = metadata.type === "episode";

  return (
    <Box
      sx={{
        width: "100vw",
        height: "100vh",
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: isEpisode ? "flex-start" : "center",
        px: isEpisode ? "8vw" : 0,
        gap: "4vw",
        opacity: visible ? 1 : 0,
        transition: "all 0.6s cubic-bezier(0.23, 1, 0.32, 1)",
        zIndex: 1000,
        pointerEvents: "none",
      }}
    >
      <Box
        component="img"
        src={metadata.thumb ? getTranscodeImageURL(metadata.thumb, 1500, 1500) : undefined}
        alt=""
        sx={{
          height: "25vw",
          width: "auto",
          objectFit: "cover",
          borderRadius: 2,
          boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
          transform: `translateX(${visible ? 0 : -40}vw) perspective(1000px) rotateY(${visible ? 0 : -30}deg)`,
          transition: "transform 0.7s cubic-bezier(0.23, 1, 0.32, 1)",
          transitionDelay: "0.2s",
          border: "2px solid rgba(255,255,255,0.1)",
        }}
      />
      <Box
        sx={{
          width: "45vw",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          textAlign: "left",
          transform: `translateX(${visible ? 0 : -80}vw)`,
          transition: "transform 0.6s cubic-bezier(0.23, 1, 0.32, 1)",
          transitionDelay: "0.1s",
        }}
      >
        {isEpisode &&
          showMetadata?.childCount &&
          showMetadata.childCount > 1 && (
            <Typography
              sx={{
                fontSize: "0.9vw",
                color: theme.palette.primary.main,
                fontWeight: 500,
                textTransform: "uppercase",
                mb: 0.5,
              }}
            >
              Season {metadata.parentIndex}
            </Typography>
          )}

        <Typography
          sx={{
            fontSize: isEpisode ? "2.5vw" : "3.5vw",
            fontWeight: 700,
            color: "#fff",
            lineHeight: 1.1,
            textShadow: "0 2px 4px rgba(0,0,0,0.3)",
          }}
        >
          {isEpisode ? metadata.grandparentTitle : metadata.title}
        </Typography>

        {isEpisode && (
          <Typography
            sx={{
              fontSize: "1.2vw",
              fontWeight: 600,
              color: "rgba(255,255,255,0.9)",
              mt: 2,
              mb: 0.5,
            }}
          >
            {metadata.title}{" "}
            <Box component="span" sx={{ opacity: 0.6 }}>
              · EP.{metadata.index}
            </Box>
          </Typography>
        )}

        <Box sx={{ mt: isEpisode ? 0 : 2, mb: isEpisode ? 1 : 3 }}>
          <MediaFacts metadata={metadata} />
        </Box>

        {!isEpisode && metadata.tagline && (
          <Typography
            sx={{
              fontSize: "1vw",
              fontWeight: 600,
              color: theme.palette.primary.main,
              mb: 2,
              fontStyle: "italic",
            }}
          >
            {metadata.tagline}
          </Typography>
        )}

        <Typography
          sx={{
            fontSize: "1vw",
            color: "rgba(255,255,255,0.8)",
            lineHeight: 1.6,
            maxWidth: "90%",
            position: "relative",
            "&:before": {
              content: '""',
              position: "absolute",
              left: -20,
              top: 8,
              bottom: 8,
              width: 3,
              bgcolor: theme.palette.primary.main,
              borderRadius: 1,
              opacity: 0.8,
            },
          }}
        >
          {metadata.summary}
        </Typography>
      </Box>
    </Box>
  );
}
