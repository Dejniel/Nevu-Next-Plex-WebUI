import { libraryEntryKey } from "@nevu/contracts";
import React, { useState } from "react";
import { Box, FormControlLabel, Switch, Typography } from "@mui/material";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { PlayCircleOutlineRounded } from "@mui/icons-material";
import { useLibraryViewport, type LibraryQuery } from "features/library/model";
import {
  getResponsiveTranscodeImageProps,
  LANDSCAPE_IMAGE_WIDTHS,
  mediaArtworkPath,
} from "entities/media/model";
import { catalogItemTo, mediaWatchTo } from "shared/lib/navigation";
import { CollectionViewport } from "shared/ui/CollectionViewport";
import { useImageLoading, imageFadeSx } from "shared/ui/useImageLoading";
import { photoAspectRatio, photoMonth } from "../model/photos";
import { PhotoViewer } from "./PhotoViewer";

export function PhotoGallery({
  query,
  cardSize = 40,
  observeRef,
}: {
  query: LibraryQuery | null;
  cardSize?: number;
  observeRef?: React.RefObject<HTMLElement | null>;
}) {
  const [information, setInformation] = useState(false);
  const [params] = useSearchParams();
  const location = useLocation();
  const { grid, range, hasData } = useLibraryViewport(query, {
    itemWidth: 160 + cardSize * 2,
    imageAspectRatio: 1.5,
    footerHeight: information ? 52 : 24,
    observeRef,
  });
  const mediaAt = (index: number) => {
    const item = range.items.get(index);
    return item?.type === "folder" ? undefined : item;
  };
  return (
    <>
      <FormControlLabel
        control={
          <Switch
            size="small"
            checked={information}
            onChange={(_, value) => setInformation(value)}
          />
        }
        label="Show photo information"
      />
      <CollectionViewport
        grid={grid}
        range={range}
        hasData={hasData}
        emptyMessage="No photos found."
        itemKey={libraryEntryKey}
        columnWeights={(start, columns) =>
          Array.from({ length: columns }, (_, column) =>
            photoAspectRatio(mediaAt(start + column)),
          )
        }
        renderItem={(item, index, sizes) => {
          if (item.type === "folder") return null;
          const next = new URLSearchParams(params);
          const album = item.type === "photoalbum";
          const clip = item.type === "clip";
          next.set("photo", item.ratingKey);
          next.set("photoIndex", String(index));
          const artwork = mediaArtworkPath(item, "landscape");
          const previous = mediaAt(index - 1);
          const month =
            !album &&
            query?.sort.startsWith("originallyAvailableAt") &&
            (index === 0 ||
              photoMonth(item) !== (previous && photoMonth(previous)))
              ? photoMonth(item)
              : "";
          return (
            <Box sx={{ minWidth: 0 }}>
              <Typography
                variant="caption"
                sx={{ display: "block", height: 24, fontWeight: 600 }}
                aria-hidden={!month}
              >
                {month}
              </Typography>
              <Box
                component={Link}
                to={
                  album
                    ? catalogItemTo(location, item)!
                    : clip
                      ? mediaWatchTo(item)
                      : { pathname: location.pathname, search: `?${next}` }
                }
                preventScrollReset
                state={
                  album ? { catalogNavigation: true } : { photoPreview: true }
                }
                aria-label={`${clip ? "Play video" : "View photo"} ${item.title}`}
                sx={{
                  display: "block",
                  position: "relative",
                  height: grid.rowHeight - (information ? 68 : 40),
                  borderRadius: 1,
                  overflow: "hidden",
                  bgcolor: "#15171c",
                  "&:focus-visible": {
                    outline: "2px solid",
                    outlineColor: "primary.main",
                  },
                }}
              >
                {artwork ? (
                  <PhotoThumbnail
                    key={artwork}
                    artwork={artwork}
                    ratio={photoAspectRatio(item)}
                    sizes={sizes}
                  />
                ) : (
                  <Typography sx={{ p: 2 }}>Image unavailable</Typography>
                )}
                {clip && (
                  <PlayCircleOutlineRounded
                    sx={{
                      position: "absolute",
                      top: "50%",
                      left: "50%",
                      transform: "translate(-50%, -50%)",
                      fontSize: 48,
                    }}
                  />
                )}
              </Box>
              {(information || album) && (
                <Typography
                  noWrap
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: "block", mt: 0.5 }}
                >
                  {item.title} · {item.originallyAvailableAt || "No date"}
                </Typography>
              )}
            </Box>
          );
        }}
      />
      {params.has("photo") && <PhotoViewer query={query} />}
    </>
  );
}
function PhotoThumbnail({
  artwork,
  ratio,
  sizes,
}: {
  artwork: string;
  ratio: number;
  sizes: string;
}) {
  const image = getResponsiveTranscodeImageProps(artwork, {
    widths: LANDSCAPE_IMAGE_WIDTHS,
    aspectRatio: ratio,
    sizes,
    fallbackWidth: 480,
  });
  const { status, imageProps } = useImageLoading(image.src);
  return status === "missing" ? (
    <Typography sx={{ p: 1 }} color="text.secondary">
      Image unavailable
    </Typography>
  ) : (
    <Box
      component="img"
      key={image.src}
      {...image}
      alt=""
      loading="eager"
      decoding="async"
      {...imageProps}
      sx={{
        width: "100%",
        height: "100%",
        objectFit: "contain",
        ...imageFadeSx(status === "loaded"),
      }}
    />
  );
}
