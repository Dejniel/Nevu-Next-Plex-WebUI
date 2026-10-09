import { Box, Button, Paper, Typography } from "@mui/material";
import { ArrowForwardRounded } from "@mui/icons-material";
import React from "react";
import { ActionableMediaCard } from "features/media-actions/public";
import { type MediaMetadata, getTranscodeImageURL } from "entities/media/model";
import { TitleExtra } from "entities/media/model";
import { MediaExtraPlayback } from "entities/media/public";
import TitleCastMember from "./TitleCastMember";

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

function HorizontalRail({
  children,
  itemWidth,
}: {
  children: React.ReactNode;
  itemWidth: object;
}) {
  return (
    <Box
      sx={{
        width: "100%",
        display: "grid",
        gridAutoFlow: "column",
        gridAutoColumns: itemWidth,
        gap: 2,
        overflowX: "auto",
        overflowY: "hidden",
        pb: 1,
        scrollSnapType: "x proximity",
        scrollbarWidth: "none",
        "&::-webkit-scrollbar": { display: "none" },
        "& > *": { scrollSnapAlign: "start" },
      }}
    >
      {children}
    </Box>
  );
}

export default function TitleOverview({
  data,
  trailer,
  onShowDetails,
  onShowReviews,
}: {
  data: MediaMetadata;
  trailer: TitleExtra | null;
  onShowDetails: () => void;
  onShowReviews: () => void;
}) {
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
    <Box
      sx={{ width: "100%", display: "flex", flexDirection: "column", gap: 6 }}
    >
      {trailer && (
        <Box sx={{ width: "100%" }}>
          <SectionTitle>Trailer</SectionTitle>
          <Box
            sx={{
              width: "min(720px, 100%)",
              aspectRatio: "16 / 9",
              overflow: "hidden",
              borderRadius: 1,
              bgcolor: "#000",
            }}
          >
            <MediaExtraPlayback
              extra={trailer}
              poster={
                data.art ? getTranscodeImageURL(data.art, 1280, 720) : undefined
              }
            />
          </Box>
        </Box>
      )}

      {reviews.length > 0 && (
        <Box sx={{ width: "100%" }}>
          <SectionTitle
            action={{ label: "All reviews", onClick: onShowReviews }}
          >
            Reviews
          </SectionTitle>
          <HorizontalRail itemWidth={{ xs: "min(82vw, 320px)", sm: "360px" }}>
            {reviews.map((review) => (
              <Paper key={review.id} sx={{ p: 2.5, height: "100%" }}>
                <Typography sx={{ fontWeight: 700 }}>{review.tag}</Typography>
                <Typography
                  variant="body2"
                  sx={{ color: "text.secondary", mb: 1.5 }}
                >
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
            ))}
          </HorizontalRail>
        </Box>
      )}

      {related.length > 0 && (
        <Box sx={{ width: "100%" }}>
          <SectionTitle>More like this</SectionTitle>
          <HorizontalRail
            itemWidth={{ xs: "min(72vw, 220px)", sm: "220px", md: "240px" }}
          >
            {related.map((item) => (
              <Box key={item.ratingKey}>
                <ActionableMediaCard item={item} />
              </Box>
            ))}
          </HorizontalRail>
        </Box>
      )}

      {cast.length > 0 && (
        <Box sx={{ width: "100%" }}>
          <SectionTitle action={{ label: "Full cast", onClick: onShowDetails }}>
            Cast
          </SectionTitle>
          <HorizontalRail itemWidth={{ xs: "220px", sm: "240px" }}>
            {cast.map((role) => (
              <TitleCastMember
                key={`${role.id ?? role.tag}:${role.role ?? ""}`}
                member={role}
                sectionId={data.librarySectionID}
              />
            ))}
          </HorizontalRail>
        </Box>
      )}
    </Box>
  );
}
