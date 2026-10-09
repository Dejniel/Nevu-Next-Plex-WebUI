import { MoreVertRounded } from "@mui/icons-material";
import { Box, IconButton, Menu, Typography } from "@mui/material";
import { ActionableMediaCard } from "features/media-actions/public";
import { TrackRow } from "features/music/public";
import type { MediaArtworkLayout } from "entities/media/model";
import { memo, useCallback, useState } from "react";
import type { MediaListEntry } from "../model/mediaLists";
import type { PlaylistAction } from "./PlaylistEditor";
import { renderPlaylistEntryMenuItems } from "./PlaylistEntryMenuItems";

interface PlaylistEntryCardProps {
  entry: MediaListEntry;
  layout: MediaArtworkLayout;
  imageSizes: string;
  playbackTo?: string;
  editable: boolean;
  onEdit: (action: PlaylistAction) => void;
  onPlay?: (entry: MediaListEntry) => void;
}

function PlaylistEntryCard({
  entry,
  editable,
  onEdit,
  onPlay,
  ...cardProps
}: PlaylistEntryCardProps) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const renderMenuItems = useCallback(
    (onClose: () => void) =>
      renderPlaylistEntryMenuItems(entry, onEdit, onClose),
    [entry, onEdit],
  );
  const canEdit = editable && Boolean(entry.playlistItemID);
  const play = useCallback(() => onPlay?.(entry), [entry, onPlay]);
  return (
    <>
      {entry.supported && entry.item.type === "track" ? (
        <TrackRow
          item={entry.item}
          index={entry.position}
          numbered
          onPlay={onPlay ? play : undefined}
          renderMenuItems={canEdit ? renderMenuItems : undefined}
        />
      ) : entry.supported ? (
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
      {entry.item.type !== "track" && (
        <Typography variant="caption" color="text.secondary">
          {entry.position + 1}
        </Typography>
      )}
    </>
  );
}

export default memo(PlaylistEntryCard);
