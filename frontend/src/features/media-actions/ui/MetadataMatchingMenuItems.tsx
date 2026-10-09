import { AutoFixHighRounded, LinkOffRounded } from "@mui/icons-material";
import { ListItemIcon, ListItemText, MenuItem } from "@mui/material";
import type { MediaItemData } from "entities/media/model";
import {
  openMetadataMatchDialog,
  openMetadataUnmatchDialog,
} from "../model/mediaActionDialog";
import { matchActionLabel } from "../model/matching";
import type { MediaActionCapabilities } from "../model/mediaActionCapabilities";

export function renderMetadataMatchingMenuItems({
  item,
  capabilities,
  onClose,
  showMatch = true,
}: {
  item: MediaItemData;
  capabilities: Pick<MediaActionCapabilities, "canMatch" | "canUnmatch">;
  onClose: () => void;
  showMatch?: boolean;
}) {
  return [
    showMatch && capabilities.canMatch && (
      <MenuItem
        key="match"
        onClick={() => {
          onClose();
          openMetadataMatchDialog(item);
        }}
      >
        <ListItemIcon>
          <AutoFixHighRounded fontSize="small" />
        </ListItemIcon>
        <ListItemText>{matchActionLabel(item)}…</ListItemText>
      </MenuItem>
    ),
    capabilities.canUnmatch && (
      <MenuItem
        key="unmatch"
        onClick={() => {
          onClose();
          openMetadataUnmatchDialog(item);
        }}
      >
        <ListItemIcon>
          <LinkOffRounded fontSize="small" />
        </ListItemIcon>
        <ListItemText>Unmatch</ListItemText>
      </MenuItem>
    ),
  ];
}
