import { DownloadRounded } from "@mui/icons-material";
import { Box, IconButton, Menu, MenuItem, Tooltip, Typography } from "@mui/material";
import React, { useState } from "react";
import { useServerSession } from "features/session/public";
import { formatDownloadDetails, getOriginalDownloads } from "../model/downloads";

const buttonStyle = {
  width: 38,
  height: 38,
  borderRadius: 1,
  bgcolor: "rgba(18, 25, 39, 0.8)",
  border: "1px solid rgba(255,255,255,0.2)",
};

export default function OriginalDownloadButton({ data }: { data: Plex.Metadata }) {
  const allowDownloads = useServerSession(
    (state) => state.server?.allowSync === true,
  );
  const downloads = getOriginalDownloads(data, allowDownloads);
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
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
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
                {formatDownloadDetails(download)}
              </Typography>
            </Box>
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
