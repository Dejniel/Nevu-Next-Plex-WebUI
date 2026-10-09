import { Box, Stack, Typography } from "@mui/material";
import { MovieOutlined, StarRounded } from "@mui/icons-material";
import { Link, useLocation } from "react-router-dom";
import { useImageLoading, imageFadeSx } from "shared/ui/useImageLoading";
import { mediaDetailsTo } from "shared/lib/navigation";
import {
  formatMediaRating,
  getPrimaryMediaRating,
} from "../model/mediaRatings";
import { mediaArtworkPath } from "../model/mediaArtwork";
import { mediaCardText } from "../model/mediaCardText";
import { getTranscodeImageURL } from "../model/mediaImages";
import type { MediaCardProps } from "./MediaCard";

/** A detail row shares the same action owner as the corresponding media card. */
export function MediaRow({
  item,
  PlexTvSource,
  overlayActions,
  onContextMenu,
}: MediaCardProps) {
  const location = useLocation();
  const artwork = mediaArtworkPath(item, "poster");
  const src = artwork ? getTranscodeImageURL(artwork, 120, 180) : null;
  const { status, imageProps } = useImageLoading(src);
  const text = mediaCardText(item, "landscape");
  const rating = getPrimaryMediaRating(item);
  return (
    <Stack
      direction="row"
      role="listitem"
      onContextMenu={onContextMenu}
      sx={{
        height: 76,
        alignItems: "center",
        gap: { xs: 1, sm: 2 },
        px: 1,
        borderRadius: 1,
        "&:hover": { bgcolor: "action.hover" },
      }}
    >
      <Box
        component={Link}
        to={mediaDetailsTo(location, item, PlexTvSource)}
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          flex: 1,
          minWidth: 0,
          textDecoration: "none",
          color: "inherit",
        }}
      >
        <Box
          sx={{
            width: 40,
            height: 60,
            flexShrink: 0,
            borderRadius: 0.5,
            overflow: "hidden",
            bgcolor: "action.hover",
            display: { xs: "none", sm: "flex" },
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {src && status !== "missing" ? (
            <Box
              component="img"
              key={src}
              src={src}
              alt=""
              loading="eager"
              decoding="async"
              {...imageProps}
              sx={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                ...imageFadeSx(status === "loaded"),
              }}
            />
          ) : (
            <MovieOutlined color="disabled" />
          )}
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography noWrap sx={{ fontWeight: 600 }}>
            {text.title}
          </Typography>
          <Typography noWrap variant="body2" color="text.secondary">
            {text.subtitle}
          </Typography>
        </Box>
      </Box>
      {rating && (
        <Stack
          direction="row"
          sx={{
            alignItems: "center",
            gap: 0.5,
            display: { xs: "none", md: "flex" },
          }}
        >
          <StarRounded fontSize="small" color="warning" />
          <Typography variant="body2">
            {formatMediaRating(rating.value)}
          </Typography>
        </Stack>
      )}
      <Stack
        direction="row"
        sx={{ gap: 0.5, alignItems: "center", flexShrink: 0 }}
      >
        {overlayActions}
      </Stack>
    </Stack>
  );
}
