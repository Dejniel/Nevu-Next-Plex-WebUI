import { DownloadRounded } from "@mui/icons-material";
import { ListItemIcon, ListItemText, MenuItem } from "@mui/material";
import {
  formatDownloadDetails,
  type OriginalDownload,
} from "../model/downloads";

/** Return menu entries directly: MUI Menu does not accept fragment children. */
export function renderOriginalDownloadMenuItems({
  downloads,
  onClose,
  singleLabel,
}: {
  downloads: readonly OriginalDownload[];
  onClose: () => void;
  singleLabel?: string;
}) {
  return downloads.map((download) => (
    <MenuItem
      key={`${download.media.id}:${download.part.id}:${download.part.key}`}
      component="a"
      href={download.href}
      download={download.filename}
      onClick={onClose}
      sx={{ maxWidth: "min(440px, 90vw)" }}
    >
      <ListItemIcon>
        <DownloadRounded fontSize="small" />
      </ListItemIcon>
      <ListItemText
        primary={
          downloads.length === 1 && singleLabel
            ? singleLabel
            : download.filename
        }
        secondary={formatDownloadDetails(download)}
        slotProps={{ primary: { noWrap: true }, secondary: { noWrap: true } }}
      />
    </MenuItem>
  ));
}
