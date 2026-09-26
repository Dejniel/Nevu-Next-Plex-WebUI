import {
  Dialog,
  IconButton,
  Typography,
} from "@mui/material";
import { CloseRounded } from "@mui/icons-material";
import React from "react";
import { TitleExtra } from "../../plex/discover";
import ExtraPlayer from "./ExtraPlayer";

export default function TrailerDialog({
  extra,
  onClose,
}: {
  extra: TitleExtra | null;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={Boolean(extra)}
      onClose={onClose}
      fullScreen
      PaperProps={{ sx: { bgcolor: "#000", border: 0 } }}
    >
      <IconButton
        aria-label="Close player"
        onClick={onClose}
        sx={{
          position: "absolute",
          top: 12,
          right: 12,
          zIndex: 2,
          bgcolor: "rgba(0,0,0,0.7)",
        }}
      >
        <CloseRounded />
      </IconButton>

      {extra && <ExtraPlayer extra={extra} autoPlay onEnded={onClose} />}

      {extra && (
        <Typography
          sx={{
            position: "absolute",
            left: 20,
            bottom: 16,
            maxWidth: "calc(100% - 40px)",
            textShadow: "0 1px 4px #000",
          }}
        >
          {extra.metadata.title}
        </Typography>
      )}
    </Dialog>
  );
}
