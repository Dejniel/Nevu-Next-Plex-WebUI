import {
  AutoFixHighRounded,
  CheckCircleOutlineRounded,
  CheckCircleRounded,
  DownloadRounded,
  EditRounded,
  InfoOutlined,
  LinkOffRounded,
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
import { isMediaWatched, type MediaItemData } from "entities/media/model";
import { WatchlistMenuItem } from "features/watchlist/public";
import {
  renderMediaListMenuItems,
  type MediaListKind,
} from "features/media-lists/public";
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
import type { MediaActionCapabilities } from "../model/mediaActionCapabilities";

export interface MediaMenuAnchor {
  element?: HTMLElement;
  position?: { top: number; left: number };
}

export default function MediaActionsMenu({
  anchor,
  capabilities,
  detailsTarget,
  downloads,
  downloadsLoading,
  item,
  location,
  onClose,
  onAddToList,
  onEditMetadata,
  onMatch,
  onPlay,
  onSetWatched,
  onUnmatch,
  canPlay = true,
}: {
  anchor: MediaMenuAnchor | null;
  capabilities: MediaActionCapabilities;
  detailsTarget: To;
  downloads: OriginalDownload[];
  downloadsLoading: boolean;
  item: MediaItemData;
  location: AppLocation;
  onClose: () => void;
  onAddToList: (kind: MediaListKind) => void;
  onEditMetadata: () => void;
  onMatch: () => void;
  onPlay: () => void;
  onSetWatched: (watched: boolean) => void;
  onUnmatch: () => void;
  canPlay?: boolean;
}) {
  const watched = isMediaWatched(item);
  const { similarRatingKey } = capabilities;

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
        disabled={!canPlay}
        onClick={() => {
          onClose();
          onPlay();
        }}
      >
        <ListItemIcon><PlayArrowRounded fontSize="small" /></ListItemIcon>
        <ListItemText>Play</ListItemText>
      </MenuItem>

      <WatchlistMenuItem item={item} onDone={onClose} />
      {renderMediaListMenuItems({
        capabilities,
        onSelect: (kind) => {
          onClose();
          onAddToList(kind);
        },
      })}

      {capabilities.canSetWatched && (
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

      {similarRatingKey && (
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

      {capabilities.canDownload && downloadsLoading && (
        <MenuItem disabled>
          <ListItemIcon><CircularProgress size={18} color="inherit" /></ListItemIcon>
          <ListItemText>Loading original file…</ListItemText>
        </MenuItem>
      )}
      {capabilities.canDownload && !downloadsLoading && downloads.map((download) => (
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

      {(capabilities.canSetWatched || capabilities.canEditMetadata) && <Divider />}

      {capabilities.canEditMetadata && (
        <MenuItem
          onClick={() => {
            onClose();
            onEditMetadata();
          }}
        >
          <ListItemIcon><EditRounded fontSize="small" /></ListItemIcon>
          <ListItemText>Edit Metadata…</ListItemText>
        </MenuItem>
      )}

      {capabilities.canMatch && (
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

      {capabilities.canUnmatch && (
        <MenuItem
          onClick={() => {
            onClose();
            onUnmatch();
          }}
        >
          <ListItemIcon><LinkOffRounded fontSize="small" /></ListItemIcon>
          <ListItemText>Unmatch</ListItemText>
        </MenuItem>
      )}

      <MenuItem component={Link} to={detailsTarget} onClick={onClose}>
        <ListItemIcon><InfoOutlined fontSize="small" /></ListItemIcon>
        <ListItemText>Get Info</ListItemText>
      </MenuItem>
    </Menu>
  );
}
