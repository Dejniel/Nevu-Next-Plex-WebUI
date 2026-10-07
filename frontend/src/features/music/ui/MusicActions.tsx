import React, { useState } from "react";
import { Button, IconButton, Menu, MenuItem, Stack } from "@mui/material";
import {
  MoreVertRounded,
  PlayArrowRounded,
  ShuffleRounded,
} from "@mui/icons-material";
import type { MediaItemData } from "entities/media/model";
import { useMusic } from "../model/MusicProvider";

export function MusicMenu({ item }: { item: MediaItemData }) {
  const music = useMusic();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const action = (next: boolean) => {
    setAnchor(null);
    void music.add(item, next);
  };
  return (
    <>
      <IconButton
        aria-label={`Actions for ${item.title}`}
        onClick={(event) => setAnchor(event.currentTarget)}
      >
        <MoreVertRounded />
      </IconButton>
      <Menu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={() => setAnchor(null)}
      >
        <MenuItem
          disabled={music.busy}
          onClick={() => {
            setAnchor(null);
            void music.play(item);
          }}
        >
          Play
        </MenuItem>
        <MenuItem disabled={music.busy} onClick={() => action(true)}>
          Play next
        </MenuItem>
        <MenuItem disabled={music.busy} onClick={() => action(false)}>
          Add to queue
        </MenuItem>
      </Menu>
    </>
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
