import {
  Avatar,
  Box,
  Button,
  CircularProgress,
  Grid,
  Typography,
} from "@mui/material";
import { PlayArrowRounded } from "@mui/icons-material";
import React from "react";
import { useSearchParams } from "react-router-dom";
import { getTranscodeImageURL } from "../../plex";
import { durationToText } from "../MovieItemSlider";
import { extraTypeLabel, TitleExtra } from "../../plex/discover";

function Detail({ label, value }: { label: string; value?: React.ReactNode }) {
  if (!value) return null;
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
        {label}
      </Typography>
      <Typography sx={{ overflowWrap: "anywhere" }}>{value}</Typography>
    </Box>
  );
}

export default function TitleDetails({
  data,
  extras,
  loadingExtras,
  onPlayExtra,
}: {
  data: Plex.Metadata;
  extras: TitleExtra[];
  loadingExtras: boolean;
  onPlayExtra: (extra: TitleExtra) => void;
}) {
  const [, setSearchParams] = useSearchParams();

  return (
    <Box sx={{ width: "100%", display: "flex", flexDirection: "column", gap: 6 }}>
      <Box sx={{ width: "100%" }}>
        <Typography variant="h5" sx={{ fontWeight: 700, mb: 2 }}>
          Details
        </Typography>
        <Grid container spacing={3} sx={{ width: "100%" }}>
          <Grid size={{ xs: 6, md: 3 }}>
            <Detail label="Released" value={data.originallyAvailableAt || data.year} />
          </Grid>
          <Grid size={{ xs: 6, md: 3 }}>
            <Detail label="Studio" value={data.studio} />
          </Grid>
          <Grid size={{ xs: 6, md: 3 }}>
            <Detail label="Original title" value={data.originalTitle} />
          </Grid>
          <Grid size={{ xs: 6, md: 3 }}>
            <Detail label="Content rating" value={data.contentRating} />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <Detail label="Countries" value={data.Country?.map((item) => item.tag).join(", ")} />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <Detail label="Genres" value={data.Genre?.map((item) => item.tag).join(", ")} />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <Detail label="Directors" value={data.Director?.map((item) => item.tag).join(", ")} />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <Detail label="Writers" value={data.Writer?.map((item) => item.tag).join(", ")} />
          </Grid>
        </Grid>
      </Box>

      <Box sx={{ width: "100%" }}>
        <Typography variant="h5" sx={{ fontWeight: 700, mb: 2 }}>
          More extras
        </Typography>
        {loadingExtras && extras.length === 0 ? (
          <CircularProgress size={28} />
        ) : extras.length === 0 ? (
          <Typography color="text.secondary">No additional extras are available.</Typography>
        ) : (
          <Grid container spacing={1.5} sx={{ width: "100%" }}>
            {extras.map((extra) => {
              const media = extra.metadata.Media?.[0];
              return (
                <Grid
                  key={`${extra.source}:${extra.metadata.ratingKey || extra.metadata.key}`}
                  size={{ xs: 12, sm: 6, md: 4 }}
                >
                  <Button
                    onClick={() => onPlayExtra(extra)}
                    startIcon={<PlayArrowRounded />}
                    sx={{
                      width: "100%",
                      minHeight: 76,
                      px: 2,
                      justifyContent: "flex-start",
                      textAlign: "left",
                    }}
                  >
                    <Box sx={{ minWidth: 0 }}>
                      <Typography noWrap sx={{ fontWeight: 700 }}>
                        {extra.metadata.title}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {extraTypeLabel(extra.metadata)}
                        {extra.metadata.duration
                          ? ` · ${durationToText(extra.metadata.duration)}`
                          : ""}
                        {media?.videoResolution ? ` · ${media.videoResolution}` : ""}
                      </Typography>
                    </Box>
                  </Button>
                </Grid>
              );
            })}
          </Grid>
        )}
      </Box>

      {(data.Role?.length ?? 0) > 0 && (
        <Box sx={{ width: "100%" }}>
          <Typography variant="h5" sx={{ fontWeight: 700, mb: 2 }}>
            Full cast
          </Typography>
          <Grid container spacing={1.5} sx={{ width: "100%" }}>
            {data.Role?.map((role) => (
              <Grid key={role.id} size={{ xs: 6, sm: 4, md: 3 }}>
                <Button
                  onClick={() =>
                    setSearchParams({
                      bkey: `/library/sections/${data.librarySectionID}/actor/${role.id}`,
                    })
                  }
                  sx={{
                    width: "100%",
                    minHeight: 72,
                    justifyContent: "flex-start",
                    gap: 1.5,
                    px: 1.5,
                    overflow: "hidden",
                  }}
                >
                  <Avatar
                    src={
                      role.thumb
                        ? getTranscodeImageURL(role.thumb, 120, 120)
                        : undefined
                    }
                    alt=""
                    sx={{ width: 48, height: 48, flexShrink: 0 }}
                  />
                  <Box sx={{ minWidth: 0, textAlign: "left" }}>
                    <Typography noWrap sx={{ fontWeight: 600 }}>
                      {role.tag}
                    </Typography>
                    <Typography noWrap variant="body2" color="text.secondary">
                      {role.role}
                    </Typography>
                  </Box>
                </Button>
              </Grid>
            ))}
          </Grid>
        </Box>
      )}
    </Box>
  );
}
