import {
  CollectionsBookmarkRounded,
  PlaylistPlayRounded,
  PhotoAlbumRounded,
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
import { useImageLoading, imageFadeSx } from "shared/ui/useImageLoading";
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
  const artwork = list.image
    ? getResponsiveTranscodeImageProps(list.image, {
        widths:
          layout === "poster" ? POSTER_IMAGE_WIDTHS : LANDSCAPE_IMAGE_WIDTHS,
        aspectRatio: mediaCardAspectRatio(layout),
        sizes: imageSizes,
        fallbackWidth: 480,
      })
    : null;
  const { status, imageProps } = useImageLoading(artwork?.src);
  const icon =
    list.playlistType === "photo" ? (
      <PhotoAlbumRounded sx={{ fontSize: 64 }} />
    ) : list.kind === "playlist" ? (
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
        {artwork && status !== "missing" ? (
          <Box
            component="img"
            key={artwork.src}
            alt=""
            loading="lazy"
            decoding="async"
            {...artwork}
            {...imageProps}
            sx={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              ...imageFadeSx(status === "loaded"),
            }}
          />
        ) : (
          icon
        )}
      </Box>
      <Typography noWrap sx={{ mt: 1, fontWeight: 700 }} title={list.title}>
        {list.title}
      </Typography>
      <Typography noWrap variant="body2" sx={{ color: "text.secondary" }}>
        {list.count}{" "}
        {list.playlistType === "photo"
          ? list.count === 1
            ? "photo"
            : "photos"
          : list.count === 1
            ? "item"
            : "items"}
        {list.smart ? " · Smart" : ""}
      </Typography>
    </Box>
  );
}
