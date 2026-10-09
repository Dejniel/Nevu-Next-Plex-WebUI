import { DeleteOutlineRounded, SwapVertRounded } from "@mui/icons-material";
import { ListItemIcon, ListItemText, MenuItem } from "@mui/material";
import type { MediaListEntry } from "../model/mediaLists";
import type { PlaylistAction } from "./PlaylistEditor";

export function renderPlaylistEntryMenuItems(
  entry: MediaListEntry,
  onEdit: (action: PlaylistAction) => void,
  onClose: () => void,
) {
  return [
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
      <ListItemText>
        Remove from {entry.item.type === "photo" ? "album" : "playlist"}…
      </ListItemText>
    </MenuItem>,
  ];
}
