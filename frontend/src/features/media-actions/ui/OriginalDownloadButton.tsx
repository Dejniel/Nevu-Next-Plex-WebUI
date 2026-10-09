import type { MediaMetadata } from "entities/media/model";
import { DownloadRounded } from "@mui/icons-material";
import { IconButton, Menu, Tooltip } from "@mui/material";
import React, { useImperativeHandle, useState } from "react";
import { getOriginalDownloads } from "../model/downloads";
import { renderOriginalDownloadMenuItems } from "./OriginalDownloadMenuItems";

const buttonStyle = {
  width: 38,
  height: 38,
  borderRadius: 1,
  bgcolor: "rgba(18, 25, 39, 0.8)",
  border: "1px solid rgba(255,255,255,0.2)",
};

export default function OriginalDownloadButton({
  data,
  canDownload,
  menuRef,
}: {
  data: MediaMetadata;
  canDownload: boolean;
  menuRef?: React.Ref<{ open: (anchor: HTMLElement) => void }>;
}) {
  const downloads = getOriginalDownloads(data, canDownload);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  useImperativeHandle(menuRef, () => ({ open: setAnchor }), []);

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
        {renderOriginalDownloadMenuItems({
          downloads,
          onClose: () => setAnchor(null),
        })}
      </Menu>
    </>
  );
}
