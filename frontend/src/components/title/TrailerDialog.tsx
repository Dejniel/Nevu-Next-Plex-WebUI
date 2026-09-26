import {
  Alert,
  Box,
  CircularProgress,
  Dialog,
  IconButton,
  Typography,
} from "@mui/material";
import { CloseRounded } from "@mui/icons-material";
import React, { useEffect, useState } from "react";
import ReactPlayer from "react-player";
import { resolveExtraURL, TitleExtra } from "../../plex/discover";

export default function TrailerDialog({
  extra,
  onClose,
}: {
  extra: TitleExtra | null;
  onClose: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setUrl(null);
    setError(null);
    if (!extra)
      return () => {
        active = false;
      };

    resolveExtraURL(extra)
      .then((resolvedURL) => active && setUrl(resolvedURL))
      .catch((reason) => {
        if (!active) return;
        setError(reason instanceof Error ? reason.message : "Unable to play this extra.");
      });

    return () => {
      active = false;
    };
  }, [extra]);

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

      <Box
        sx={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          bgcolor: "#000",
        }}
      >
        {!url && !error && <CircularProgress />}
        {error && <Alert severity="error">{error}</Alert>}
        {url && (
          <ReactPlayer
            url={url}
            playing
            controls
            width="100%"
            height="100%"
            onEnded={onClose}
            config={{
              file: {
                attributes: {
                  controlsList: "nodownload",
                  disablePictureInPicture: false,
                  style: { objectFit: "contain", width: "100%", height: "100%" },
                },
              },
            }}
          />
        )}
      </Box>

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
