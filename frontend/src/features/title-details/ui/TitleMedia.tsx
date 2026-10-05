import { Box, Grid, Paper, Typography } from "@mui/material";
import React from "react";

function formatBytes(bytes?: number) {
  if (!bytes) return null;
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index > 2 ? 1 : 0)} ${units[index]}`;
}

function Value({ label, value }: { label: string; value?: React.ReactNode }) {
  if (value === undefined || value === null || value === "") return null;
  return (
    <Box>
      <Typography variant="caption" sx={{ color: "text.secondary" }}>
        {label}
      </Typography>
      <Typography>{value}</Typography>
    </Box>
  );
}

export default function TitleMedia({ data }: { data: Plex.Metadata }) {
  const media = data.Media || [];
  if (media.length === 0) {
    return (
      <Typography sx={{ color: "text.secondary" }}>
        Technical details are available on individual episodes.
      </Typography>
    );
  }

  return (
    <Box sx={{ width: "100%", display: "flex", flexDirection: "column", gap: 3 }}>
      <Typography variant="h5" sx={{ fontWeight: 700 }}>
        Media files
      </Typography>
      {media.map((item, mediaIndex) => {
        const parts = item.Part || [];
        const streams = parts.flatMap((part) => part.Stream || []);
        const audio = streams.filter((stream) => stream.streamType === 2);
        const subtitles = streams.filter((stream) => stream.streamType === 3);
        const size = parts.reduce((total, part) => total + (part.size || 0), 0);

        return (
          <Paper key={item.id || mediaIndex} sx={{ p: { xs: 2, sm: 3 }, width: "100%" }}>
            <Typography variant="h6" sx={{ mb: 2 }}>
              Version {mediaIndex + 1}
            </Typography>
            <Grid container spacing={2.5} sx={{ width: "100%" }}>
              <Grid size={{ xs: 6, sm: 3 }}>
                <Value label="Resolution" value={`${item.width} × ${item.height}`} />
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                <Value label="Video" value={item.videoCodec?.toUpperCase()} />
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                <Value label="Dynamic range" value={item.videoDynamicRange || item.videoProfile} />
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                <Value label="Container" value={item.container?.toUpperCase()} />
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                <Value label="Bitrate" value={item.bitrate ? `${(item.bitrate / 1000).toFixed(1)} Mb/s` : null} />
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                <Value label="Frame rate" value={item.videoFrameRate} />
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                <Value label="Size" value={formatBytes(size)} />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Value
                  label="Audio tracks"
                  value={audio
                    .map((stream) => stream.extendedDisplayTitle || stream.displayTitle)
                    .filter(Boolean)
                    .join(", ")}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Value
                  label="Subtitles"
                  value={subtitles.length
                    ? subtitles
                        .map((stream) => stream.extendedDisplayTitle || stream.displayTitle)
                        .filter(Boolean)
                        .join(", ")
                    : "None"}
                />
              </Grid>
            </Grid>
          </Paper>
        );
      })}
    </Box>
  );
}
