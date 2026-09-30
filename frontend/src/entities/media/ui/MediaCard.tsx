import {
  CheckCircleOutlineRounded,
  VolumeOffRounded,
  VolumeUpRounded,
  StarRounded,
  MovieOutlined,
  TvRounded,
  MusicNoteRounded,
  PhotoOutlined,
  VideoLibraryOutlined,
} from "@mui/icons-material";
import {
  Box,
  Typography,
  Tooltip,
  LinearProgress,
  IconButton,
  Skeleton,
} from "@mui/material";
import React, { JSX, memo, useEffect } from "react";
import { useLocation } from "react-router-dom";
import {
  getResponsiveTranscodeImageProps,
  LANDSCAPE_IMAGE_WIDTHS,
  POSTER_IMAGE_WIDTHS,
} from "../model/mediaImages";
import { durationToText } from "shared/lib/duration";
import { StretchedLink } from "shared/ui";
import { usePreviewAudio } from "../model/previewAudio";
import { useMediaPreview } from "../model/useMediaPreview";
import MediaExtraPlayback from "./MediaExtraPlayback";
import { mediaQualityBadge } from "../model/mediaVersions";
import { mediaArtworkPath } from "../model/mediaArtwork";
import { isMediaWatched } from "../model/mediaWatchedState";
import { alpha } from "@mui/material/styles";
import { mediaDetailsTo } from "shared/lib/navigation";
import type { MediaItemData } from "../model/media";

export interface MediaCardProps {
  item: MediaItemData;
  itemsPerPage?: number;
  index?: number;
  PlexTvSource?: boolean;
  layout?: "landscape" | "poster";
  imageSizes?: string;
  imageLoading?: "eager" | "lazy";
  overlayActions?: React.ReactNode;
  onContextMenu?: React.MouseEventHandler<HTMLDivElement>;
}

function MediaCard({
  item,
  itemsPerPage,
  index,
  PlexTvSource,
  layout = "landscape",
  imageSizes,
  imageLoading = "lazy",
  overlayActions,
  onContextMenu,
}: MediaCardProps): JSX.Element {
  const location = useLocation();
  const { muted } = usePreviewAudio();

  const [hovered, setHovered] = React.useState(false);
  const previewEnabled = layout === "landscape";
  const preview = useMediaPreview(
    item,
    hovered &&
      previewEnabled &&
      !new URLSearchParams(location.search).has("mid"),
    PlexTvSource,
  );
  const isEpisode = item.type === "episode";
  const displayRating = item.audienceRating ?? item.rating;
  const qualityLabel = mediaQualityBadge(item);
  const cardTitle = isEpisode
    ? item.grandparentTitle || item.parentTitle || item.title
    : item.title;
  const episodeCode = [
    item.parentIndex !== undefined
      ? `S${String(item.parentIndex).padStart(2, "0")}`
      : null,
    item.index !== undefined ? `E${String(item.index).padStart(2, "0")}` : null,
  ]
    .filter(Boolean)
    .join(" ");
  const secondaryText = isEpisode
    ? [episodeCode, cardTitle !== item.title ? item.title : null]
        .filter(Boolean)
        .join(" · ")
    : [
        item.year || null,
        item.type === "movie" && item.duration
          ? durationToText(item.duration)
          : null,
        item.type === "show" && (item.seasonCount ?? item.childCount)
          ? `${item.seasonCount ?? item.childCount} ${
              (item.seasonCount ?? item.childCount) === 1 ? "Season" : "Seasons"
            }`
          : null,
        item.Genre?.slice(0, layout === "landscape" ? 2 : 1)
          .map((genre) => genre.tag)
          .join(", ") || null,
      ]
        .filter(Boolean)
        .join(" · ");
  const artworkPath = mediaArtworkPath(item, layout);
  const artwork = artworkPath
    ? getResponsiveTranscodeImageProps(artworkPath, {
        widths:
          layout === "poster" ? POSTER_IMAGE_WIDTHS : LANDSCAPE_IMAGE_WIDTHS,
        aspectRatio: layout === "poster" ? 2 / 3 : 16 / 9,
        sizes:
          imageSizes ||
          (itemsPerPage
            ? `${Math.ceil(95 / itemsPerPage)}vw`
            : "(max-width: 600px) calc(100vw - 16px), 320px"),
        fallbackWidth: layout === "poster" ? 480 : 640,
      })
    : null;
  const artworkUrl = artwork?.src || null;
  const [artworkStatus, setArtworkStatus] = React.useState<
    "loading" | "loaded" | "missing"
  >(artworkUrl ? "loading" : "missing");
  const detailsTarget = mediaDetailsTo(location, item, PlexTvSource);

  useEffect(() => {
    setArtworkStatus(artworkUrl ? "loading" : "missing");
  }, [artworkUrl]);

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        justifyContent: "flex-start",
        width: itemsPerPage
          ? `calc((100vw / ${itemsPerPage}) - 10px - (5vw / ${itemsPerPage}))`
          : "100%",
        minWidth: itemsPerPage
          ? `calc((100vw / ${itemsPerPage}) - 10px - (5vw / ${itemsPerPage}))`
          : "100%",
        backgroundColor: "rgba(18, 18, 22, 0.7)",
        backdropFilter: "blur(15px)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: "8px",
        overflow: "hidden",
        position: "relative",
        boxShadow: "0px 2px 8px rgba(0, 0, 0, 0.3)",
        willChange: "transform",
        backfaceVisibility: "hidden",
        transformOrigin:
          itemsPerPage && index !== undefined
            ? index % itemsPerPage === 0
              ? "left center"
              : index % itemsPerPage === itemsPerPage - 1
                ? "right center"
                : "center center"
            : "center center",
        transition:
          "transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease, background-color 0.2s ease",
        cursor: "pointer",

        "&:hover": {
          transform: "scale(1.02)",
          zIndex: 10,
          backgroundColor: (theme) => alpha(theme.palette.primary.main, 0.08),
          boxShadow: (theme) =>
            `0 0 18px ${alpha(theme.palette.primary.main, 0.34)}, 0 6px 18px rgba(0, 0, 0, 0.42)`,
          borderColor: (theme) => alpha(theme.palette.primary.main, 0.62),
        },

        "&:hover .movie-item-hover-overlay": {
          opacity: "1 !important",
        },

        "&:has(.movie-item-link:focus-visible)": {
          borderColor: (theme) => theme.palette.primary.light,
          boxShadow: (theme) =>
            `0 0 0 2px ${alpha(theme.palette.primary.main, 0.7)}`,
        },
      }}
      onContextMenu={onContextMenu}
      onMouseEnter={() => {
        setHovered(true);
      }}
      onMouseLeave={() => {
        setHovered(false);
      }}
    >
      <StretchedLink
        className="movie-item-link"
        to={detailsTarget}
        label={`Open details for ${cardTitle}`}
        zIndex={20}
      />

      {/* Thumbnail area */}
      <Box
        sx={{
          width: "100%",
          aspectRatio: layout === "poster" ? "2/3" : "16/9",
          position: "relative",
          overflow: "hidden",
          flexShrink: 0,
          backgroundColor: "#17191e",
          boxShadow:
            "inset 0 0 0 1px rgba(255,255,255,0.05), inset 0 -32px 56px rgba(0,0,0,0.24)",
        }}
      >
        {artwork && artworkStatus !== "missing" && (
          <Box
            component="img"
            {...artwork}
            alt=""
            draggable={false}
            loading={imageLoading}
            decoding="async"
            onLoad={() => setArtworkStatus("loaded")}
            onError={() => setArtworkStatus("missing")}
            sx={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              objectPosition: layout === "poster" ? "center top" : "center",
              opacity: artworkStatus === "loaded" ? 1 : 0,
              transition: "opacity 0.12s ease",
            }}
          />
        )}

        {artworkStatus === "loading" && (
          <Skeleton
            variant="rectangular"
            animation="wave"
            sx={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
            }}
          />
        )}

        {artworkStatus === "missing" && (
          <Box
            sx={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "rgba(255,255,255,0.22)",
            }}
          >
            <MediaTypePlaceholder type={item.type} />
          </Box>
        )}

        {/* Preview playback overlay */}
        {previewEnabled && (
          <Box
            sx={{
              position: "absolute",
              inset: 0,
              opacity: preview.visible ? 1 : 0,
              transition: "opacity 2s cubic-bezier(0.25,0.10,0.25,1.00)",
              backgroundColor: preview.visible
                ? "rgba(18, 25, 39, 0.95)"
                : "transparent",
              pointerEvents: "none",
              overflow: "hidden",
            }}
          >
            {preview.extra && (
              <MediaExtraPlayback
                extra={preview.extra}
                controls={false}
                playing
                volume={muted ? 0 : 0.5}
                muted={muted}
                objectFit="cover"
                showErrors={false}
                onPlaying={preview.onPlaying}
                onEnded={preview.stop}
                onPlaybackError={preview.stop}
                onPlayRejected={preview.stop}
              />
            )}
          </Box>
        )}

        {/* Hover overlay with buttons */}
        <Box
          className="movie-item-hover-overlay"
          sx={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(0deg, rgba(0,0,0,0.6) 0%, transparent 40%)",
            opacity: { xs: 1, md: 0 },
            transition: "opacity 0.3s ease",
            display: "flex",
            flexDirection: "row",
            alignItems: "flex-end",
            justifyContent: "flex-end",
            padding: "8px",
            gap: "6px",
            zIndex: 30,
            pointerEvents: "none",
          }}
        >
          {overlayActions}
        </Box>

        {/* Mute button for preview */}
        {previewEnabled && (
          <IconButton
            size="small"
            sx={{
              backgroundColor: "rgba(18, 25, 39, 0.55)",
              backdropFilter: "blur(12px)",
              border: "1px solid rgba(255,255,255,0.15)",
              opacity: preview.extra ? 1 : 0,
              transition: "opacity 0.4s ease, background-color 0.2s ease",
              position: "absolute",
              top: "8px",
              left: "8px",
              zIndex: 30,
              padding: "1px",
              "&:hover": {
                backgroundColor: "rgba(18, 25, 39, 0.8)",
              },
              width: "28px",
              height: "28px",
            }}
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              if (!item) return;

              usePreviewAudio.setState((state) => ({
                muted: !state.muted,
              }));
            }}
          >
            {muted ? (
              <VolumeOffRounded sx={{ fontSize: "12px" }} />
            ) : (
              <VolumeUpRounded sx={{ fontSize: "12px" }} />
            )}
          </IconButton>
        )}

        {/* Watched badge */}
        {isMediaWatched(item) && (
          <Box
            sx={{
              position: "absolute",
              top: "8px",
              right: "8px",
              backgroundColor: "rgba(18, 25, 39, 0.55)",
              backdropFilter: "blur(12px)",
              border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: "4px",
              padding: "2px 6px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "4px",
              zIndex: 10,
            }}
          >
            <Tooltip title="Watched" arrow placement="top">
              <Box sx={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <CheckCircleOutlineRounded
                  sx={{
                    fontSize: "14px",
                    color: (theme) => theme.palette.primary.light,
                  }}
                />
                <Typography
                  sx={{
                    fontSize: "10px",
                    fontWeight: "700",
                    letterSpacing: "0.05em",
                    color: "rgba(255,255,255,0.9)",
                  }}
                >
                  Watched
                </Typography>
              </Box>
            </Tooltip>
          </Box>
        )}

        {/* Audience score */}
        {typeof displayRating === "number" && (
          <Box
            sx={{
              position: "absolute",
              top: "8px",
              left: preview.extra ? "40px" : "8px",
              transition: "left 0.4s ease",
              backgroundColor: "rgba(18, 25, 39, 0.55)",
              backdropFilter: "blur(12px)",
              border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: "4px",
              padding: "1px 6px",
              display: "flex",
              alignItems: "center",
              gap: "3px",
              zIndex: 10,
            }}
          >
            <StarRounded sx={{ fontSize: "13px", color: "#f5c518" }} />
            <Typography
              sx={{
                fontSize: "11px",
                fontWeight: "600",
                color: "rgba(255,255,255,0.9)",
                lineHeight: 1.4,
              }}
            >
              {displayRating.toFixed(1)}
            </Typography>
          </Box>
        )}
      </Box>

      {/* Progress bar */}
      {item.duration !== undefined &&
        item.duration > 0 &&
        (item.type === "episode" ||
          (item.type === "movie" && item.viewOffset)) && (
          <LinearProgress
            variant="determinate"
            value={((item?.viewOffset ?? 0) / item.duration) * 100}
            sx={{
              width: "100%",
              height: "3px",
              flexShrink: 0,
              bgcolor: "rgba(255, 255, 255, 0.08)",
              "& .MuiLinearProgress-bar": {
                backgroundColor: (theme) => theme.palette.primary.main,
              },
            }}
          />
        )}

      {/* Info section */}
      <Box
        sx={{
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "flex-start",
          padding: "9px 11px 10px",
          minHeight: "60px",
          userSelect: "none",
          position: "relative",
          zIndex: 5,
          gap: "3px",
        }}
      >
        {/* Title */}
        <Typography
          sx={{
            fontSize: "0.95rem",
            fontWeight: "600",
            color: (theme) => theme.palette.text.primary,
            textOverflow: "ellipsis",
            overflow: "hidden",
            whiteSpace: "nowrap",
            width: "100%",
            lineHeight: 1.3,
            "@media (max-width: 2000px)": {
              fontSize: "0.9rem",
            },
          }}
        >
          {cardTitle}
        </Typography>

        <Box
          sx={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 1,
            minWidth: 0,
          }}
        >
          <Typography
            sx={{
              fontSize: "11px",
              fontWeight: "500",
              color: (theme) => theme.palette.text.secondary,
              opacity: 0.7,
              textOverflow: "ellipsis",
              overflow: "hidden",
              whiteSpace: "nowrap",
              minWidth: 0,
            }}
          >
            {secondaryText}
          </Typography>

          {layout === "landscape" && qualityLabel && (
            <Typography
              title={qualityLabel}
              sx={{
                fontSize: "9px",
                fontWeight: "700",
                lineHeight: 1,
                color: "rgba(255,255,255,0.72)",
                backgroundColor: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: "3px",
                px: "4px",
                py: "3px",
                flexShrink: 0,
              }}
            >
              {qualityLabel}
            </Typography>
          )}
        </Box>
      </Box>
    </Box>
  );
}

export default memo(MediaCard);

function MediaTypePlaceholder({ type }: { type: string }) {
  const sx = { fontSize: "clamp(38px, 6vw, 72px)" };

  if (["show", "season", "episode"].includes(type))
    return <TvRounded sx={sx} />;
  if (["artist", "album", "track"].includes(type))
    return <MusicNoteRounded sx={sx} />;
  if (type === "photo") return <PhotoOutlined sx={sx} />;
  if (["movie", "video"].includes(type)) return <MovieOutlined sx={sx} />;
  return <VideoLibraryOutlined sx={sx} />;
}
