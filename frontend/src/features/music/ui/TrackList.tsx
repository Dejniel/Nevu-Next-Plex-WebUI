import React from "react";
import {
  Alert,
  Box,
  Button,
  IconButton,
  Skeleton,
  Typography,
} from "@mui/material";
import { PlayArrowRounded } from "@mui/icons-material";
import { Link, useLocation } from "react-router-dom";
import {
  useLibraryPages,
  useLibraryWindow,
  type LibraryQuery,
} from "features/library/model";
import { catalogItemTo } from "shared/lib/navigation";
import { durationToClock } from "shared/lib/duration";
import VirtualGrid, { useVirtualGrid } from "shared/ui/VirtualGrid";
import { getTranscodeImageURL, mediaArtworkPath } from "entities/media/model";
import { useMusic } from "../model/MusicProvider";
import { MusicMenu } from "./MusicActions";

export function TrackList({
  query,
  album = false,
}: {
  query: LibraryQuery | null;
  album?: boolean;
}) {
  const collection = useLibraryWindow(query);
  const grid = useVirtualGrid({
    count: collection.totalSize,
    minimumCount: collection.knownSize + 1,
    itemWidth: 1_000_000,
    imageAspectRatio: Infinity,
    footerHeight: album ? 60 : 68,
    resetKey: collection.queryKey,
  });
  const range = useLibraryPages(collection, grid.range);
  const music = useMusic();
  const location = useLocation();
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
  if (range.totalSize === 0)
    return (
      <Typography sx={{ py: 5 }} color="text.secondary">
        No tracks found.
      </Typography>
    );
  return (
    <Box role="list" aria-label={album ? "Album tracks" : "Tracks"}>
      <VirtualGrid
        grid={grid}
        itemKey={(index) => range.items.get(index)?.ratingKey ?? index}
        renderItem={(index) => {
          const item = range.items.get(index);
          if (!item) return <Skeleton variant="rounded" height={64} />;
          const cover = mediaArtworkPath(item, "square");
          const artist =
            item.grandparentRatingKey &&
            catalogItemTo(location, {
              ratingKey: item.grandparentRatingKey,
              type: "artist",
              librarySectionID: item.librarySectionID,
            });
          const albumLink =
            item.parentRatingKey &&
            catalogItemTo(location, {
              ratingKey: item.parentRatingKey,
              type: "album",
              librarySectionID: item.librarySectionID,
            });
          const active = music.track?.ratingKey === item.ratingKey;
          return (
            <Box
              role="listitem"
              sx={{
                display: "flex",
                gap: { xs: 0.5, sm: 1.5 },
                alignItems: "center",
                height: album ? 60 : 68,
                borderTop:
                  album && item.index === 1 && index > 0
                    ? "1px solid"
                    : undefined,
                borderColor: "divider",
                px: { xs: 0.25, sm: 1 },
                borderRadius: 1,
                bgcolor: active ? "action.selected" : undefined,
                "&:hover": { bgcolor: "action.hover" },
              }}
            >
              <IconButton
                aria-label={`Play ${item.title}`}
                disabled={music.busy}
                onClick={() => void music.play(item)}
              >
                <PlayArrowRounded />
              </IconButton>
              {album ? (
                <Typography
                  color="text.secondary"
                  sx={{ width: 36, flexShrink: 0, fontSize: 12 }}
                >
                  {item.parentIndex && item.parentIndex > 1
                    ? `${item.parentIndex}.`
                    : ""}
                  {item.index ?? index + 1}
                </Typography>
              ) : (
                cover && (
                  <Box
                    component="img"
                    src={getTranscodeImageURL(cover, 96, 96)}
                    alt=""
                    sx={{
                      width: 44,
                      height: 44,
                      borderRadius: 0.5,
                      display: { xs: "none", sm: "block" },
                    }}
                  />
                )
              )}
              <Box sx={{ minWidth: 0, flex: 1 }}>
                {album && item.index === 1 && (
                  <Typography
                    component="h3"
                    variant="caption"
                    color="text.secondary"
                  >
                    Disc {item.parentIndex ?? 1}
                  </Typography>
                )}
                <Button
                  variant="text"
                  onClick={() => void music.play(item)}
                  sx={{
                    p: 0,
                    minWidth: 0,
                    justifyContent: "flex-start",
                    color: active ? "primary.main" : "text.primary",
                    textTransform: "none",
                    maxWidth: "100%",
                  }}
                >
                  <Typography noWrap sx={{ fontWeight: 600 }}>
                    {item.title}
                  </Typography>
                </Button>
                {!album && (
                  <Typography noWrap variant="body2" color="text.secondary">
                    {artist ? (
                      <Box
                        component={Link}
                        to={artist}
                        sx={{ color: "inherit" }}
                      >
                        {item.grandparentTitle}
                      </Box>
                    ) : (
                      item.grandparentTitle
                    )}
                    {item.parentTitle && " · "}
                    {albumLink ? (
                      <Box
                        component={Link}
                        to={albumLink}
                        sx={{ color: "inherit" }}
                      >
                        {item.parentTitle}
                      </Box>
                    ) : (
                      item.parentTitle
                    )}
                  </Typography>
                )}
              </Box>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ flexShrink: 0 }}
              >
                {durationToClock("duration" in item ? item.duration : 0)}
              </Typography>
              <MusicMenu item={item} />
            </Box>
          );
        }}
      />
    </Box>
  );
}
