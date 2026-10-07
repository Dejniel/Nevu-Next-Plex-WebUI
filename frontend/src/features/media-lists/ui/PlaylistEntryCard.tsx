import {
  DeleteOutlineRounded,
  MoreVertRounded,
  SwapVertRounded,
} from "@mui/icons-material";
import {
  Box,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Typography,
} from "@mui/material";
import { ActionableMediaCard } from "features/media-actions/public";
import { memo, useCallback, useState } from "react";
import type { MediaListEntry } from "../model/mediaLists";
import type { PlaylistAction } from "./PlaylistEditor";

interface PlaylistEntryCardProps {
  entry: MediaListEntry;
  layout: "poster" | "landscape";
  imageSizes: string;
  playbackTo?: string;
  editable: boolean;
  onEdit: (action: PlaylistAction) => void;
}

function PlaylistEntryCard({
  entry,
  editable,
  onEdit,
  ...cardProps
}: PlaylistEntryCardProps) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const renderMenuItems = useCallback(
    (onClose: () => void) => [
      <MenuItem
        key="move"
        onClick={() => {
          onClose();
          onEdit({ type: "move", entry });
        }}
      >
        <ListItemIcon>
          <SwapVertRounded fontSize="small" />
        </ListItemIcon>
        <ListItemText>Move to position…</ListItemText>
      </MenuItem>,
      <MenuItem
        key="remove"
        onClick={() => {
          onClose();
          onEdit({ type: "remove", entry });
        }}
      >
        <ListItemIcon>
          <DeleteOutlineRounded fontSize="small" />
        </ListItemIcon>
        <ListItemText>Remove from playlist…</ListItemText>
      </MenuItem>,
    ],
    [entry, onEdit],
  );
  const canEdit = editable && Boolean(entry.playlistItemID);
  return (
    <>
      {entry.supported ? (
        <ActionableMediaCard
          {...cardProps}
          item={entry.item}
          imageLoading="eager"
          renderMenuItems={canEdit ? renderMenuItems : undefined}
        />
      ) : (
        <Box sx={{ p: 2, bgcolor: "action.hover", borderRadius: 1 }}>
          <Typography>{entry.item.title}</Typography>
          <Typography variant="body2" color="text.secondary">
            This item cannot be opened on this server.
          </Typography>
          {canEdit && (
            <IconButton
              aria-label={`Playlist actions for ${entry.item.title}`}
              onClick={(event) => setAnchor(event.currentTarget)}
            >
              <MoreVertRounded />
            </IconButton>
          )}
          <Menu
            anchorEl={anchor}
            open={Boolean(anchor)}
            onClose={() => setAnchor(null)}
          >
            {renderMenuItems(() => setAnchor(null))}
          </Menu>
        </Box>
      )}
      <Typography variant="caption" color="text.secondary">
        {entry.position + 1}
      </Typography>
    </>
  );
}

export default memo(PlaylistEntryCard);
