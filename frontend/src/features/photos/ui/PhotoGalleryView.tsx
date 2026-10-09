import type React from "react";
import { Box, FormControlLabel, Switch, Typography } from "@mui/material";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { PlayCircleOutlineRounded } from "@mui/icons-material";
import {
  getResponsiveTranscodeImageProps,
  LANDSCAPE_IMAGE_WIDTHS,
  mediaArtworkPath,
  type MediaItemData,
} from "entities/media/model";
import { catalogItemTo, mediaWatchTo } from "shared/lib/navigation";
import {
  CollectionViewport,
  type CollectionRange,
} from "shared/ui/CollectionViewport";
import type { useVirtualGrid } from "shared/lib/useVirtualGrid";
import { useImageLoading, imageFadeSx } from "shared/ui/useImageLoading";
import { MediaItemMenu } from "features/media-actions/public";
import { photoAspectRatio, photoMonth } from "../model/photos";

/** Source-independent gallery: library and personal album readers keep ownership of their pages. */
export function PhotoGalleryView<T>({
  grid,
  range,
  hasData,
  information,
  onInformationChange,
  itemKey,
  getItem,
  chronological = false,
  renderMenuItems,
  renderUnavailable,
}: {
  grid: ReturnType<typeof useVirtualGrid>;
  range: CollectionRange<T>;
  hasData: boolean;
  information: boolean;
  onInformationChange: (value: boolean) => void;
  itemKey: (record: T) => React.Key;
  getItem: (record: T) => MediaItemData | undefined;
  chronological?: boolean;
  renderMenuItems?: (record: T, close: () => void) => React.ReactNode;
  renderUnavailable?: (record: T, imageSizes: string) => React.ReactNode;
}) {
  const [params] = useSearchParams();
  const location = useLocation();
  const mediaAt = (index: number) => {
    const item = range.items.get(index);
    return item === undefined ? undefined : getItem(item);
  };
  return (
    <>
      <FormControlLabel
        control={
          <Switch
            size="small"
            checked={information}
            onChange={(_, value) => onInformationChange(value)}
          />
        }
        label="Show photo information"
      />
      <CollectionViewport
        grid={grid}
        range={range}
        hasData={hasData}
        emptyMessage="No photos found."
        itemKey={itemKey}
        columnWeights={(start, columns) =>
          Array.from({ length: columns }, (_, column) =>
            photoAspectRatio(mediaAt(start + column)),
          )
        }
        renderItem={(record, index, sizes) => {
          const item = getItem(record);
          if (!item && renderUnavailable)
            return renderUnavailable(record, sizes);
          if (!item)
            return (
              <Typography>
                This item cannot be opened on this server.
              </Typography>
            );
          const next = new URLSearchParams(params);
          const album = item.type === "photoalbum";
          const clip = item.type === "clip";
          next.set("photo", item.ratingKey);
          next.set("photoIndex", String(index));
          const artwork = mediaArtworkPath(item, "landscape");
          const previous = mediaAt(index - 1);
          const month =
            !album &&
            chronological &&
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
              <Box sx={{ position: "relative" }}>
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
                <Box
                  sx={{
                    position: "absolute",
                    bottom: 4,
                    right: 4,
                    bgcolor: "rgba(0,0,0,.6)",
                    borderRadius: "50%",
                  }}
                >
                  <MediaItemMenu
                    item={item}
                    renderMenuItems={
                      renderMenuItems
                        ? (close) => renderMenuItems(record, close)
                        : undefined
                    }
                  />
                </Box>
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
