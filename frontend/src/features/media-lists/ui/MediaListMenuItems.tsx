import {
  CollectionsBookmarkRounded,
  PlaylistAddRounded,
  PhotoAlbumRounded,
} from "@mui/icons-material";
import { ListItemIcon, ListItemText, MenuItem } from "@mui/material";
import type { MediaListCapabilities } from "../model/mediaListEditing";
import type { MediaListKind, PlaylistType } from "../model/mediaLists";

export default function renderMediaListMenuItems({
  capabilities,
  onSelect,
  playlistType,
}: {
  capabilities: MediaListCapabilities;
  onSelect: (kind: MediaListKind) => void;
  playlistType?: PlaylistType;
}) {
  return [
    capabilities.canAddToPlaylist && (
      <MenuItem key="playlist" onClick={() => onSelect("playlist")}>
        <ListItemIcon>
          {playlistType === "photo" ? (
            <PhotoAlbumRounded fontSize="small" />
          ) : (
            <PlaylistAddRounded fontSize="small" />
          )}
        </ListItemIcon>
        <ListItemText>
          {playlistType === "photo" ? "Add to album…" : "Add to playlist…"}
        </ListItemText>
      </MenuItem>
    ),
    capabilities.canAddToCollection && (
      <MenuItem key="collection" onClick={() => onSelect("collection")}>
        <ListItemIcon>
          <CollectionsBookmarkRounded fontSize="small" />
        </ListItemIcon>
        <ListItemText>Add to collection…</ListItemText>
      </MenuItem>
    ),
  ];
}
