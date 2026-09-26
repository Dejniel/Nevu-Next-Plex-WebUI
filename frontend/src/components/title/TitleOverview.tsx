import {
  Avatar,
  Box,
  Button,
  Grid,
  Paper,
  Typography,
} from "@mui/material";
import { ArrowForwardRounded } from "@mui/icons-material";
import React from "react";
import { useSearchParams } from "react-router-dom";
import MovieItem from "../MovieItem";
import { getTranscodeImageURL } from "../../plex";

function SectionTitle({
  children,
  action,
}: {
  children: React.ReactNode;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <Box
      sx={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 2,
        mb: 2,
      }}
    >
      <Typography variant="h5" sx={{ fontWeight: 700 }}>
        {children}
      </Typography>
      {action && (
        <Button endIcon={<ArrowForwardRounded />} onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </Box>
  );
}

export default function TitleOverview({
  data,
  onShowDetails,
  onShowReviews,
}: {
  data: Plex.Metadata;
  onShowDetails: () => void;
  onShowReviews: () => void;
}) {
  const [, setSearchParams] = useSearchParams();
  const related = Array.from(
    new Map(
      (data.Related?.Hub || [])
        .flatMap((hub) => hub.Metadata || [])
        .filter((item) => item.ratingKey !== data.ratingKey)
        .map((item) => [item.ratingKey, item]),
    ).values(),
  ).slice(0, 8);
  const cast = (data.Role || []).slice(0, 8);
  const reviews = (data.Review || []).slice(0, 3);

  return (
    <Box sx={{ width: "100%", display: "flex", flexDirection: "column", gap: 6 }}>
      {related.length > 0 && (
        <Box sx={{ width: "100%" }}>
          <SectionTitle>More like this</SectionTitle>
          <Grid container spacing={2} sx={{ width: "100%" }}>
            {related.map((item) => (
              <Grid key={item.ratingKey} size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
                <MovieItem item={item} />
              </Grid>
            ))}
          </Grid>
        </Box>
      )}

      {cast.length > 0 && (
        <Box sx={{ width: "100%" }}>
          <SectionTitle action={{ label: "Full cast", onClick: onShowDetails }}>
            Cast
          </SectionTitle>
          <Grid container spacing={1.5} sx={{ width: "100%" }}>
            {cast.map((role) => (
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
                    src={role.thumb ? getTranscodeImageURL(role.thumb, 120, 120) : undefined}
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

      {reviews.length > 0 && (
        <Box sx={{ width: "100%" }}>
          <SectionTitle action={{ label: "All reviews", onClick: onShowReviews }}>
            Reviews
          </SectionTitle>
          <Grid container spacing={2} sx={{ width: "100%" }}>
            {reviews.map((review) => (
              <Grid key={review.id} size={{ xs: 12, md: 4 }}>
                <Paper sx={{ p: 2.5, height: "100%" }}>
                  <Typography sx={{ fontWeight: 700 }}>{review.tag}</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                    {review.source}
                  </Typography>
                  <Typography
                    sx={{
                      display: "-webkit-box",
                      WebkitLineClamp: 5,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                  >
                    {review.text}
                  </Typography>
                </Paper>
              </Grid>
            ))}
          </Grid>
        </Box>
      )}
    </Box>
  );
}
