import React from "react";
import { MediaItemMenu } from "features/media-actions/public";
import { Button, Divider, MenuItem, Stack } from "@mui/material";
import { PlayArrowRounded, ShuffleRounded } from "@mui/icons-material";
import type { MediaItemData } from "entities/media/model";
import { useMusic } from "../model/MusicProvider";

export function MusicMenu({
  item,
  onPlay,
  renderMenuItems,
}: {
  item: MediaItemData;
  onPlay?: () => void;
  renderMenuItems?: (onClose: () => void) => React.ReactNode;
}) {
  const music = useMusic();
  return (
    <MediaItemMenu
      item={item}
      renderMenuItems={(close) => [
        <MenuItem
          key="play"
          disabled={music.busy}
          onClick={() => {
            close();
            if (onPlay) onPlay();
            else void music.play(item);
          }}
        >
          Play
        </MenuItem>,
        <MenuItem
          key="next"
          disabled={music.busy}
          onClick={() => {
            close();
            void music.add(item, true);
          }}
        >
          Play next
        </MenuItem>,
        <MenuItem
          key="queue"
          disabled={music.busy}
          onClick={() => {
            close();
            void music.add(item, false);
          }}
        >
          Add to queue
        </MenuItem>,
        renderMenuItems && <Divider key="custom" />,
        renderMenuItems?.(close),
      ]}
    />
  );
}

export function MusicActions({ item }: { item: MediaItemData }) {
  const music = useMusic();
  return (
    <Stack
      direction="row"
      spacing={1}
      sx={{ flexWrap: "wrap", alignItems: "center" }}
    >
      <Button
        variant="contained"
        startIcon={<PlayArrowRounded />}
        disabled={music.busy}
        onClick={() => void music.play(item)}
      >
        Play
      </Button>
      <Button
        variant="outlined"
        startIcon={<ShuffleRounded />}
        disabled={music.busy}
        onClick={() => void music.play(item, true)}
      >
        Shuffle
      </Button>
      <MusicMenu item={item} />
    </Stack>
  );
}
