import { SkipNextRounded } from "@mui/icons-material";
import {
  Box,
  Fade,
  IconButton,
  Paper,
  Popper,
  Typography,
} from "@mui/material";
import React from "react";
import { getTranscodeImageURL } from "entities/media/model";

export default function NextQueueButton({
  queue,
  onAdvance,
}: {
  queue?: Plex.Metadata[];
  onAdvance: () => void;
}) {
  const [anchorEl, setAnchorEl] = React.useState<HTMLElement | null>(null);
  const next = queue?.[1];

  if (!next) return null;

  return (
    <>
      <Popper
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        placement="top-start"
        transition
        sx={{
          zIndex: 10000,
          "& .MuiPaper-root": {
            overflow: "hidden",
            borderRadius: 1,
            background: "transparent",
          },
        }}
        modifiers={[{ name: "offset", options: { offset: [0, 10] } }]}
      >
        {({ TransitionProps }) => (
          <Fade {...TransitionProps} timeout={350}>
            <Paper
              sx={{
                width: "35vw",
                height: "auto",
                aspectRatio: "32/8",
                overflow: "hidden",
                display: "flex",
                alignItems: "flex-start",
              }}
            >
              <img
                src={getTranscodeImageURL(next.thumb, 500, 500)}
                alt=""
                style={{ height: "100%", aspectRatio: "16/9", width: "auto" }}
              />
              <Box
                sx={{
                  width: "100%",
                  height: "100%",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  p: 2,
                  backgroundColor: "#00000088",
                }}
              >
                <Typography
                  sx={{
                    fontSize: "0.7vw",
                    fontWeight: 700,
                    letterSpacing: "0.15em",
                    color: "primary.main",
                    textTransform: "uppercase",
                  }}
                >
                  {next.type} {next.type === "episode" && next.index}
                </Typography>
                <Typography sx={{ fontSize: "0.8vw", fontWeight: 700 }}>
                  {next.title}
                </Typography>
                <Typography
                  sx={{
                    mt: "2px",
                    fontSize: "0.6vw",
                    display: "-webkit-box",
                    WebkitLineClamp: 5,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {next.summary}
                </Typography>
              </Box>
            </Paper>
          </Fade>
        )}
      </Popper>
      <IconButton
        aria-label="Next item"
        onClick={onAdvance}
        onMouseEnter={(event) => setAnchorEl(event.currentTarget)}
        onMouseLeave={() => setAnchorEl(null)}
      >
        <SkipNextRounded fontSize="small" />
      </IconButton>
    </>
  );
}
