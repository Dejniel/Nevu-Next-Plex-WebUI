import { PlayArrowRounded } from "@mui/icons-material";
import { Box, Button, IconButton, Typography } from "@mui/material";
import { Link, useLocation } from "react-router-dom";
import { memo } from "react";
import {
  getTranscodeImageURL,
  mediaArtworkPath,
  type MediaItemData,
} from "entities/media/model";
import { catalogItemTo } from "shared/lib/navigation";
import { durationToClock } from "shared/lib/duration";
import { useImageLoading, imageFadeSx } from "shared/ui/useImageLoading";
import { useMusic } from "../model/MusicProvider";
import { MusicMenu } from "./MusicActions";

export const TrackRow = memo(function TrackRow({
  item,
  index,
  album = false,
  numbered = false,
  onPlay,
  renderMenuItems,
}: {
  item: MediaItemData;
  index: number;
  album?: boolean;
  numbered?: boolean;
  onPlay?: () => void;
  renderMenuItems?: (onClose: () => void) => React.ReactNode;
}) {
  const music = useMusic();
  const location = useLocation();
  const play =
    onPlay ??
    (() => {
      void music.play(item);
    });
  const active = music.track?.ratingKey === item.ratingKey;
  const cover = mediaArtworkPath(item, "square");
  const src = cover ? getTranscodeImageURL(cover, 96, 96) : null;
  const { status, imageProps } = useImageLoading(src);
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
  return (
    <Box
      role="listitem"
      sx={{
        display: "flex",
        gap: { xs: 0.5, sm: 1.5 },
        alignItems: "center",
        height: album ? 60 : 68,
        px: { xs: 0.25, sm: 1 },
        borderRadius: 1,
        borderTop:
          album && item.index === 1 && index > 0 ? "1px solid" : undefined,
        borderColor: "divider",
        bgcolor: active ? "action.selected" : undefined,
        "&:hover": { bgcolor: "action.hover" },
      }}
    >
      {numbered && (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ width: 28, flexShrink: 0, textAlign: "right" }}
        >
          {index + 1}
        </Typography>
      )}
      <IconButton
        aria-label={`Play ${item.title}`}
        disabled={music.busy}
        onClick={play}
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
        src &&
        status !== "missing" && (
          <Box
            component="img"
            key={src}
            src={src}
            alt=""
            decoding="async"
            {...imageProps}
            sx={{
              width: 44,
              height: 44,
              borderRadius: 0.5,
              display: { xs: "none", sm: "block" },
              ...imageFadeSx(status === "loaded"),
            }}
          />
        )
      )}
      <Box sx={{ minWidth: 0, flex: 1 }}>
        {album && item.index === 1 && (
          <Typography component="h3" variant="caption" color="text.secondary">
            Disc {item.parentIndex ?? 1}
          </Typography>
        )}
        <Button
          variant="text"
          disabled={music.busy}
          onClick={play}
          sx={{
            p: 0,
            minWidth: 0,
            justifyContent: "flex-start",
            maxWidth: "100%",
            color: active ? "primary.main" : "text.primary",
            textTransform: "none",
          }}
        >
          <Typography noWrap sx={{ fontWeight: 600 }}>
            {item.title}
          </Typography>
        </Button>
        {!album && (
          <Typography noWrap variant="body2" color="text.secondary">
            {artist ? (
              <Box component={Link} to={artist} sx={{ color: "inherit" }}>
                {item.grandparentTitle}
              </Box>
            ) : (
              item.grandparentTitle
            )}
            {item.parentTitle && " · "}
            {albumLink ? (
              <Box component={Link} to={albumLink} sx={{ color: "inherit" }}>
                {item.parentTitle}
              </Box>
            ) : (
              item.parentTitle
            )}
          </Typography>
        )}
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ flexShrink: 0 }}>
        {durationToClock("duration" in item ? item.duration : 0)}
      </Typography>
      <MusicMenu item={item} onPlay={play} renderMenuItems={renderMenuItems} />
    </Box>
  );
});
