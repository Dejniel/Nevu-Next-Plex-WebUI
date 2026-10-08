import {
  CollectionsBookmarkRounded,
  PlaylistPlayRounded,
} from "@mui/icons-material";
import { Box, Typography } from "@mui/material";
import {
  getResponsiveTranscodeImageProps,
  LANDSCAPE_IMAGE_WIDTHS,
  POSTER_IMAGE_WIDTHS,
  mediaCardAspectRatio,
  type MediaArtworkLayout,
} from "entities/media/model";
import type { To } from "react-router-dom";
import { StretchedLink } from "shared/ui";
import type { MediaListSummary } from "../model/mediaLists";

export default function MediaListCard({
  list,
  to,
  layout,
  imageSizes,
}: {
  list: MediaListSummary;
  to: To;
  layout: MediaArtworkLayout;
  imageSizes: string;
}) {
  const icon =
    list.kind === "playlist" ? (
      <PlaylistPlayRounded sx={{ fontSize: 64 }} />
    ) : (
      <CollectionsBookmarkRounded sx={{ fontSize: 64 }} />
    );
  return (
    <Box
      sx={{
        width: "100%",
        position: "relative",
        borderRadius: 1,
        "&:hover img": { opacity: 0.8 },
      }}
    >
      <StretchedLink to={to} label={`Open ${list.title}`} />
      <Box
        sx={{
          aspectRatio: mediaCardAspectRatio(layout),
          borderRadius: 1,
          overflow: "hidden",
          bgcolor: "action.hover",
          display: "grid",
          placeItems: "center",
          color: "text.secondary",
        }}
      >
        {list.image ? (
          <Box
            component="img"
            alt=""
            loading="lazy"
            {...getResponsiveTranscodeImageProps(list.image, {
              widths:
                layout === "poster"
                  ? POSTER_IMAGE_WIDTHS
                  : LANDSCAPE_IMAGE_WIDTHS,
              aspectRatio: mediaCardAspectRatio(layout),
              sizes: imageSizes,
              fallbackWidth: 480,
            })}
            sx={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          icon
        )}
      </Box>
      <Typography noWrap sx={{ mt: 1, fontWeight: 700 }} title={list.title}>
        {list.title}
      </Typography>
      <Typography noWrap variant="body2" sx={{ color: "text.secondary" }}>
        {list.count} {list.count === 1 ? "item" : "items"}
        {list.smart ? " · Smart" : ""}
      </Typography>
    </Box>
  );
}
