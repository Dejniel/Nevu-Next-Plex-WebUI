import { DownloadRounded } from "@mui/icons-material";
import {
  Box,
  IconButton,
  Menu,
  MenuItem,
  Tooltip,
  Typography,
} from "@mui/material";
import React, { useState } from "react";
import { getOriginalDownloads, OriginalDownload } from "../../plex/download";

function formatBytes(bytes?: number): string {
  if (!bytes) return "Unknown size";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  return `${(bytes / 1024 ** index).toFixed(index > 2 ? 1 : 0)} ${units[index]}`;
}

function downloadDetails(download: OriginalDownload): string {
  const resolution = download.media.videoResolution
    ? `${download.media.videoResolution}${/^\d+$/.test(download.media.videoResolution) ? "p" : ""}`
    : null;
  return [
    resolution,
    download.part.container?.toUpperCase() ||
      download.media.container?.toUpperCase(),
    formatBytes(download.part.size),
  ]
    .filter(Boolean)
    .join(" · ");
}

const buttonStyle = {
  width: 38,
  height: 38,
  borderRadius: 1,
  bgcolor: "rgba(18, 25, 39, 0.8)",
  border: "1px solid rgba(255,255,255,0.2)",
};

export default function OriginalDownloadButton({
  data,
}: {
  data: Plex.Metadata;
}) {
  const downloads = getOriginalDownloads(data);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  if (downloads.length === 0) return null;

  if (downloads.length === 1) {
    const download = downloads[0];
    return (
      <Tooltip title={`Download ${download.filename}`} arrow>
        <IconButton
          component="a"
          href={download.href}
          download={download.filename}
          aria-label={`Download original file ${download.filename}`}
          sx={buttonStyle}
        >
          <DownloadRounded fontSize="small" />
        </IconButton>
      </Tooltip>
    );
  }

  return (
    <>
      <Tooltip title="Download original file" arrow>
        <IconButton
          aria-label="Choose original file to download"
          aria-haspopup="menu"
          aria-expanded={Boolean(anchor)}
          onClick={(event) => setAnchor(event.currentTarget)}
          sx={buttonStyle}
        >
          <DownloadRounded fontSize="small" />
        </IconButton>
      </Tooltip>
      <Menu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={() => setAnchor(null)}
      >
        {downloads.map((download) => (
          <MenuItem
            key={`${download.media.id}:${download.part.id}`}
            component="a"
            href={download.href}
            download={download.filename}
            onClick={() => setAnchor(null)}
            sx={{ minWidth: 280, maxWidth: "min(440px, 90vw)" }}
          >
            <DownloadRounded fontSize="small" sx={{ mr: 1.5, flexShrink: 0 }} />
            <Box sx={{ minWidth: 0 }}>
              <Typography noWrap>{download.filename}</Typography>
              <Typography variant="body2" color="text.secondary">
                {downloadDetails(download)}
              </Typography>
            </Box>
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
