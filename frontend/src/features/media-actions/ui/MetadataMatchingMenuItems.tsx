import { AutoFixHighRounded, LinkOffRounded } from "@mui/icons-material";
import { ListItemIcon, ListItemText, MenuItem } from "@mui/material";
import type { MediaItemData } from "entities/media/model";
import { useBigReader, useConfirmModal } from "shared/ui";
import { createMetadataMatcher } from "../api/matching";
import { openMetadataMatchDialog } from "../model/metadataDialog";
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
          const source = createMetadataMatcher(item);
          useConfirmModal.getState().setModal({
            title: "Unmatch metadata",
            message: `Remove the current metadata match from "${item.title}"?`,
            onConfirm: async () => {
              try {
                await source.unmatch();
              } catch (error) {
                useBigReader
                  .getState()
                  .setBigReader(
                    error instanceof Error
                      ? error.message
                      : "Plex could not unmatch this item.",
                  );
              }
            },
            onCancel: () => undefined,
          });
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
