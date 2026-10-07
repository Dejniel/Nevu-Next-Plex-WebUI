import React, { useState } from "react";
import {
  Alert,
  Box,
  Button,
  FormControlLabel,
  Skeleton,
  Switch,
  Typography,
} from "@mui/material";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { PlayCircleOutlineRounded } from "@mui/icons-material";
import {
  useLibraryWindow,
  useLibraryPages,
  type LibraryQuery,
} from "features/library/model";
import {
  getResponsiveTranscodeImageProps,
  LANDSCAPE_IMAGE_WIDTHS,
  mediaArtworkPath,
} from "entities/media/model";
import { catalogItemTo, mediaWatchTo } from "shared/lib/navigation";
import VirtualGrid, { useVirtualGrid } from "shared/ui/VirtualGrid";
import { photoAspectRatio, photoMonth } from "../model/photos";
import { PhotoViewer } from "./PhotoViewer";

export function PhotoGallery({
  query,
  cardSize = 40,
}: {
  query: LibraryQuery | null;
  cardSize?: number;
}) {
  const collection = useLibraryWindow(query);
  const [information, setInformation] = useState(false);
  const [params] = useSearchParams();
  const location = useLocation();
  const grid = useVirtualGrid({
    count: collection.totalSize,
    minimumCount: collection.knownSize + 1,
    itemWidth: 160 + cardSize * 2,
    imageAspectRatio: 1.5,
    footerHeight: information ? 52 : 24,
    resetKey: collection.queryKey,
  });
  const range = useLibraryPages(collection, grid.range);
  const error = range.errors.get(0);
  if (error && !collection.first.data)
    return (
      <Alert
        severity="error"
        action={<Button onClick={() => range.retry(0)}>Retry</Button>}
      >
        {error.message}
      </Alert>
    );
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
      {range.totalSize === 0 ? (
        <Typography color="text.secondary" sx={{ py: 5 }}>
          No photos found.
        </Typography>
      ) : (
        <VirtualGrid
          grid={grid}
          columnWeights={(start, columns) =>
            Array.from({ length: columns }, (_, column) =>
              photoAspectRatio(range.items.get(start + column)),
            )
          }
          itemKey={(index) => range.items.get(index)?.ratingKey ?? index}
          renderItem={(index, sizes) => {
            const item = range.items.get(index);
            if (!item)
              return (
                <Skeleton variant="rounded" height={grid.rowHeight - 16} />
              );
            const next = new URLSearchParams(params);
            const album = item.type === "photoalbum";
            const clip = item.type === "clip";
            next.set("photo", item.ratingKey);
            next.set("photoIndex", String(index));
            const artwork = mediaArtworkPath(item, "landscape");
            const month =
              !album &&
              query?.sort.startsWith("originallyAvailableAt") &&
              (index === 0 ||
                photoMonth(item) !==
                  (range.items.get(index - 1) &&
                    photoMonth(range.items.get(index - 1)!)))
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
      )}
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
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const image = getResponsiveTranscodeImageProps(artwork, {
    widths: LANDSCAPE_IMAGE_WIDTHS,
    aspectRatio: ratio,
    sizes,
    fallbackWidth: 480,
  });
  return failed ? (
    <Typography sx={{ p: 1 }} color="text.secondary">
      Image unavailable
    </Typography>
  ) : (
    <Box
      component="img"
      {...image}
      alt=""
      loading="eager"
      decoding="async"
      onLoad={() => setLoaded(true)}
      onError={() => setFailed(true)}
      sx={{
        width: "100%",
        height: "100%",
        objectFit: "contain",
        opacity: loaded ? 1 : 0,
        transition: "opacity 500ms ease",
      }}
    />
  );
}
