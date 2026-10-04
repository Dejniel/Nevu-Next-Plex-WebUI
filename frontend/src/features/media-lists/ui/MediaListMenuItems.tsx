import {
  CollectionsBookmarkRounded,
  PlaylistAddRounded,
} from "@mui/icons-material";
import { ListItemIcon, ListItemText, MenuItem } from "@mui/material";
import type { MediaListCapabilities } from "../model/mediaListEditing";
import type { MediaListKind } from "../model/mediaLists";

export default function renderMediaListMenuItems({
  capabilities,
  onSelect,
}: {
  capabilities: MediaListCapabilities;
  onSelect: (kind: MediaListKind) => void;
}) {
  return [
    capabilities.canAddToPlaylist && (
      <MenuItem key="playlist" onClick={() => onSelect("playlist")}>
        <ListItemIcon>
          <PlaylistAddRounded fontSize="small" />
        </ListItemIcon>
        <ListItemText>Add to playlist…</ListItemText>
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
