import React, { useState } from "react";
import {
  Button,
  Divider,
  IconButton,
  Menu,
  MenuItem,
  Stack,
} from "@mui/material";
import {
  MoreVertRounded,
  PlayArrowRounded,
  ShuffleRounded,
} from "@mui/icons-material";
import type { MediaItemData } from "entities/media/model";
import { getMediaListCapabilities } from "features/media-lists/model";
import {
  openMediaListDialog,
  renderMediaListMenuItems,
} from "features/media-lists/public";
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
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const close = () => setAnchor(null);
  const capabilities = getMediaListCapabilities(item, {
    localItem: true,
    canManageServer: false,
  });
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
            if (onPlay) onPlay();
            else void music.play(item);
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
        {capabilities.canAddToPlaylist && <Divider />}
        {renderMediaListMenuItems({
          capabilities,
          onSelect: (kind) => {
            close();
            openMediaListDialog(kind, item);
          },
        })}
        {renderMenuItems && <Divider />}
        {renderMenuItems?.(close)}
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
