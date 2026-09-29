import {
  AutoFixHighRounded,
  CheckCircleOutlineRounded,
  CheckCircleRounded,
  DownloadRounded,
  InfoOutlined,
  PlayArrowRounded,
  RecommendRounded,
} from "@mui/icons-material";
import {
  CircularProgress,
  Divider,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
} from "@mui/material";
import type { MediaItemData } from "entities/media/model";
import { WatchlistMenuItem } from "features/watchlist/public";
import React from "react";
import { Link } from "react-router-dom";
import type { To } from "react-router-dom";
import { libraryBrowseTo } from "shared/lib/navigation";
import type { AppLocation } from "shared/lib/navigation";
import {
  formatDownloadDetails,
  type OriginalDownload,
} from "../model/downloads";
import { matchActionLabel } from "../model/matching";

export interface MediaMenuAnchor {
  element?: HTMLElement;
  position?: { top: number; left: number };
}

export function isMediaWatched(item: MediaItemData) {
  if (item.type === "show")
    return Boolean(item.leafCount && item.viewedLeafCount === item.leafCount);
  return Boolean(item.viewCount);
}

export default function MediaActionsMenu({
  anchor,
  canManageServer,
  detailsTarget,
  downloads,
  downloadsLoading,
  item,
  location,
  localItem,
  onClose,
  onMatch,
  onPlay,
  onSetWatched,
}: {
  anchor: MediaMenuAnchor | null;
  canManageServer: boolean;
  detailsTarget: To;
  downloads: OriginalDownload[];
  downloadsLoading: boolean;
  item: MediaItemData;
  location: AppLocation;
  localItem: boolean;
  onClose: () => void;
  onMatch: () => void;
  onPlay: () => void;
  onSetWatched: (watched: boolean) => void;
}) {
  const watched = isMediaWatched(item);
  const similarRatingKey =
    item.type === "episode" ? item.grandparentRatingKey : item.ratingKey;
  const canMatch =
    localItem && canManageServer && ["movie", "show"].includes(item.type);

  return (
    <Menu
      anchorEl={anchor?.element}
      anchorReference={anchor?.position ? "anchorPosition" : "anchorEl"}
      anchorPosition={anchor?.position}
      open={anchor !== null}
      onClose={onClose}
      slotProps={{ paper: { sx: { minWidth: 230, maxWidth: "min(360px, 92vw)" } } }}
    >
      <MenuItem
        onClick={() => {
          onClose();
          onPlay();
        }}
      >
        <ListItemIcon><PlayArrowRounded fontSize="small" /></ListItemIcon>
        <ListItemText>Play</ListItemText>
      </MenuItem>

      <WatchlistMenuItem item={item} onDone={onClose} />

      {localItem && (
        <MenuItem
          onClick={() => {
            onClose();
            onSetWatched(!watched);
          }}
        >
          <ListItemIcon>
            {watched ? (
              <CheckCircleOutlineRounded fontSize="small" />
            ) : (
              <CheckCircleRounded fontSize="small" />
            )}
          </ListItemIcon>
          <ListItemText>{watched ? "Mark as Unwatched" : "Mark as Watched"}</ListItemText>
        </MenuItem>
      )}

      {localItem && similarRatingKey && (
        <MenuItem
          component={Link}
          to={libraryBrowseTo(
            location,
            `/library/metadata/${similarRatingKey}/similar`,
          )}
          onClick={onClose}
        >
          <ListItemIcon><RecommendRounded fontSize="small" /></ListItemIcon>
          <ListItemText>View Similar</ListItemText>
        </MenuItem>
      )}

      {downloadsLoading && (
        <MenuItem disabled>
          <ListItemIcon><CircularProgress size={18} color="inherit" /></ListItemIcon>
          <ListItemText>Loading original file…</ListItemText>
        </MenuItem>
      )}
      {!downloadsLoading && downloads.map((download) => (
        <MenuItem
          key={`${download.media.id}:${download.part.id}`}
          component="a"
          href={download.href}
          download={download.filename}
          onClick={onClose}
        >
          <ListItemIcon><DownloadRounded fontSize="small" /></ListItemIcon>
          <ListItemText
            primary={downloads.length === 1 ? "Save File" : download.filename}
            secondary={formatDownloadDetails(download)}
            slotProps={{ secondary: { noWrap: true } }}
          />
        </MenuItem>
      ))}

      {(canMatch || localItem) && <Divider />}

      {canMatch && (
        <MenuItem
          onClick={() => {
            onClose();
            onMatch();
          }}
        >
          <ListItemIcon><AutoFixHighRounded fontSize="small" /></ListItemIcon>
          <ListItemText>{matchActionLabel(item)}…</ListItemText>
        </MenuItem>
      )}

      <MenuItem component={Link} to={detailsTarget} onClick={onClose}>
        <ListItemIcon><InfoOutlined fontSize="small" /></ListItemIcon>
        <ListItemText>Get Info</ListItemText>
      </MenuItem>
    </Menu>
  );
}
