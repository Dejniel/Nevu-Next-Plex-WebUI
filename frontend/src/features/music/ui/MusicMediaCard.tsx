import { PlayArrowRounded } from "@mui/icons-material";
import { Box, IconButton } from "@mui/material";
import { MediaCard, type MediaCardProps } from "entities/media/public";
import { memo } from "react";
import { useMusic } from "../model/MusicProvider";
import { MusicMenu } from "./MusicActions";

export const MusicMediaCard = memo(function MusicMediaCard(
  props: MediaCardProps,
) {
  const music = useMusic();
  return (
    <MediaCard
      {...props}
      overlayActions={
        <Box
          sx={{
            display: "flex",
            pointerEvents: "auto",
            bgcolor: "rgba(18,25,39,.75)",
            borderRadius: 1,
          }}
        >
          <IconButton
            aria-label={`Play ${props.item.title}`}
            disabled={music.busy}
            onClick={() => {
              void music.play(props.item);
            }}
          >
            <PlayArrowRounded />
          </IconButton>
          <MusicMenu item={props.item} />
        </Box>
      }
    />
  );
});
