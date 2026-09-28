import {
  PlayArrowRounded,
  BookmarkBorderRounded,
  CheckCircleOutlineRounded,
  BookmarkRounded,
  RecommendRounded,
  CheckCircleRounded,
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
  Button,
  CircularProgress,
  LinearProgress,
  Menu,
  MenuItem,
  Divider,
  ListItemIcon,
  IconButton,
  Skeleton,
} from "@mui/material";
import React, { JSX, memo, useEffect } from "react";
import {
  Link,
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  getTranscodeImageURL,
  getResponsiveTranscodeImageProps,
  getLibraryMeta,
  getLibraryMetaChildren,
  getItemByGUID,
  setMediaPlayedStatus,
  LANDSCAPE_IMAGE_WIDTHS,
  POSTER_IMAGE_WIDTHS,
} from "../plex";
import { durationToText } from "../common/Duration";
import {
  useWatchListCache,
  WatchListCacheEmitter,
} from "../states/WatchListCache";
import { useBigReader } from "./BigReader";
import { create } from "zustand";
import { usePreviewPlayer } from "../states/PreviewPlayerState";
import ReactPlayer from "react-player";
import { useConfirmModal } from "./ConfirmModal";
import { getBackendURL } from "../backendURL";
import { queryBuilder } from "../plex/QuickFunctions";
import { AuthStorage } from "../auth/AuthStorage";
import { mediaQualityBadge } from "../plex/mediaVersions";
import { mediaArtworkPath } from "../plex/mediaArtwork";
import { alpha } from "@mui/material/styles";
import type { LibraryCardDto } from "@nevu/contracts";
import { libraryBrowseTo, mediaDetailsTo } from "../navigation";
import StretchedLink from "./StretchedLink";

export type MovieItemData = Plex.Metadata | LibraryCardDto;

interface MovieItemPreviewPlaybackState {
  url: string;
  playing: boolean;
  setUrl: (url: string) => void;
  setPlaying: (playing: boolean) => void;
  setState: (state: { url: string; playing: boolean }) => void;
}

export const useMovieItemPreviewPlayback =
  create<MovieItemPreviewPlaybackState>((set) => ({
    url: "",
    playing: false,
    setUrl: (url: string) => set({ url }),
    setPlaying: (playing: boolean) => set({ playing }),
    setState: (state: { url: string; playing: boolean }) => set(state),
  }));

function MovieItem({
  item,
  itemsPerPage,
  index,
  PlexTvSource,
  refetchData,
  layout = "landscape",
  imageSizes,
  imageLoading = "lazy",
}: {
  item: MovieItemData;
  itemsPerPage?: number;
  index?: number;
  PlexTvSource?: boolean;
  refetchData?: () => void;
  layout?: "landscape" | "poster";
  imageSizes?: string;
  imageLoading?: "eager" | "lazy";
}): JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();
  const { MetaScreenPlayerMuted } = usePreviewPlayer();

  const [playButtonLoading, setPlayButtonLoading] = React.useState(false);
  const [contextMenu, setContextMenu] = React.useState<{
    mouseX: number;
    mouseY: number;
  } | null>(null);

  const [hovered, setHovered] = React.useState(false);
  const hoveredRef = React.useRef(hovered);
  const [previewPlaybackState, setPreviewPlaybackState] = React.useState({
    url: "",
    playing: false,
  });
  const hoverTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const previewEnabled = layout === "landscape";
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
    item.index !== undefined
      ? `E${String(item.index).padStart(2, "0")}`
      : null,
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

  useEffect(() => {
    if (hovered && previewEnabled) {
      hoverTimerRef.current = setTimeout(async () => {
        const data = await getLibraryMeta(item.ratingKey);
        if (!data) return;
        if (hoveredRef.current === false) return;

        const mediaURL = data.Extras?.Metadata?.[0]?.Media?.[0]?.Part[0]?.key;
        if (!mediaURL) return;
        setPreviewPlaybackState({
          url: `${getBackendURL()}/dynproxy${
            mediaURL.split("?")[0]
          }?${queryBuilder({
            "X-Plex-Token": AuthStorage.getServerToken(),
            ...Object.fromEntries(
              new URL("http://localhost:3000" + mediaURL).searchParams.entries()
            ),
          })}`,
          playing: true,
        });
      }, 1000);
    } else {
      if (hoverTimerRef.current) {
        clearTimeout(hoverTimerRef.current);
        hoverTimerRef.current = null;
      }
      setPreviewPlaybackState({ url: "", playing: false });
    }

    return () => {
      if (hoverTimerRef.current) {
        clearTimeout(hoverTimerRef.current);
        hoverTimerRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hovered, previewEnabled]);

  useEffect(() => {
    hoveredRef.current = hovered;
  }, [hovered]);

  const handleClose = () => {
    setContextMenu(null);
  };

  const handlePlay = async () => {
    if (!item) return;
    setPlayButtonLoading(true);

    let PlexTvSrcData: Plex.Metadata | null = null;
    if (PlexTvSource) {
      PlexTvSrcData = await getItemByGUID(item.guid);

      if (!PlexTvSrcData) {
        useBigReader
          .getState()
          .setBigReader(`"${item.title}" is not available on this Plex Server`);
        return;
      }
    }

    if (PlexTvSource && !PlexTvSrcData) return;

    let localItem = PlexTvSource ? (PlexTvSrcData as Plex.Metadata) : item;

    switch (item.type) {
      case "movie":
      case "episode":
        navigate(
          `/watch/${localItem.ratingKey}${
            localItem.viewOffset ? `?t=${localItem.viewOffset}` : ""
          }`
        );

        setPlayButtonLoading(false);
        break;
      case "show":
        {
          const data = await getLibraryMeta(localItem.ratingKey);

          if (!data) {
            setPlayButtonLoading(false);
            return;
          }

          if (data.OnDeck?.Metadata) {
            navigate(
              `/watch/${data.OnDeck.Metadata.ratingKey}${
                data.OnDeck.Metadata.viewOffset
                  ? `?t=${data.OnDeck.Metadata.viewOffset}`
                  : ""
              }`
            );

            setPlayButtonLoading(false);
            return;
          } else {
            if (data.Children?.size === 0 || !data.Children?.Metadata[0])
              return setPlayButtonLoading(false);
            // play first episode
            const episodes = await getLibraryMetaChildren(
              data.Children?.Metadata[0].ratingKey
            );
            if (episodes?.length === 0) return setPlayButtonLoading(false);

            navigate(`/watch/${episodes[0].ratingKey}`);
          }
        }
        break;
    }
  };

  // 300 x 170
  return (
    <>
      <Menu
        open={contextMenu !== null}
        onClose={handleClose}
        anchorReference="anchorPosition"
        anchorPosition={
          contextMenu !== null
            ? { top: contextMenu.mouseY, left: contextMenu.mouseX }
            : undefined
        }
      >
        <Typography
          sx={{
            fontSize: "1rem",
            fontWeight: "bold",
            px: 1,
            maxWidth: "200px",
            textOverflow: "ellipsis",
            overflow: "hidden",
            whiteSpace: "nowrap",
          }}
        >
          {item.title}
        </Typography>

        <Divider
          sx={{
            my: 1,
          }}
        />

        <MenuItem
          onClick={async (e) => {
            e.stopPropagation();
            await handlePlay();
            handleClose();
          }}
        >
          <ListItemIcon>
            <PlayArrowRounded fontSize="small" />
          </ListItemIcon>
          Play
        </MenuItem>
        <MenuItem
          component={Link}
          to={libraryBrowseTo(
            location,
            `/library/metadata/${
              item.type === "episode"
                ? item.grandparentRatingKey
                : item.ratingKey
            }/similar`,
          )}
          onClick={handleClose}
        >
          <ListItemIcon>
            <RecommendRounded fontSize="small" />
          </ListItemIcon>
          View Similar
        </MenuItem>

        <Divider
          sx={{
            my: 1,
          }}
        />

        <MenuItem
          onClick={async () => {
            if (!item) return;

            useConfirmModal.getState().setModal({
              title: `Mark as Watched`,
              message: `Are you sure you want to mark "${item.title}" as Watched?`,
              onConfirm: async () => {
                switch (item.type) {
                  case "movie":
                  case "episode":
                    item.viewCount = 1;
                    await setMediaPlayedStatus(true, item.ratingKey);
                    break;
                  case "show":
                    item.viewedLeafCount = item.leafCount;
                    await setMediaPlayedStatus(true, item.ratingKey);
                    break;
                  default:
                    break;
                }

                handleClose();
                refetchData?.();
              },
              onCancel: () => {
                handleClose();
              },
            });
          }}
        >
          <ListItemIcon>
            <CheckCircleRounded fontSize="small" />
          </ListItemIcon>
          Mark as Watched
        </MenuItem>
        <MenuItem
          onClick={async () => {
            if (!item) return;

            useConfirmModal.getState().setModal({
              title: `Mark as Unwatched`,
              message: `Are you sure you want to mark "${item.title}" as Unwatched?`,
              onConfirm: async () => {
                switch (item.type) {
                  case "movie":
                  case "episode":
                    item.viewCount = 0;
                    await setMediaPlayedStatus(false, item.ratingKey);
                    break;
                  case "show":
                    item.viewedLeafCount = 0;
                    await setMediaPlayedStatus(false, item.ratingKey);
                    break;
                  default:
                    break;
                }

                handleClose();
                refetchData?.();
              },
              onCancel: () => {
                handleClose();
              },
            });
          }}
        >
          <ListItemIcon>
            <CheckCircleOutlineRounded fontSize="small" />
          </ListItemIcon>
          Mark as Unwatched
        </MenuItem>
      </Menu>

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
              ? (index % itemsPerPage) === 0
                ? "left center"
                : (index % itemsPerPage) === itemsPerPage - 1
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
        onContextMenu={(e) => {
          e.preventDefault();
          setContextMenu(
            contextMenu === null
              ? {
                  mouseX: e.clientX + 2,
                  mouseY: e.clientY - 6,
                }
              : null
          );
        }}
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
              sx={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
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
                opacity: previewPlaybackState.playing ? 1 : 0,
                transition: "opacity 2s cubic-bezier(0.25,0.10,0.25,1.00)",
                backgroundColor: previewPlaybackState.playing
                  ? "rgba(18, 25, 39, 0.95)"
                  : "transparent",
                pointerEvents: "none",
                overflow: "hidden",
              }}
            >
              <ReactPlayer
                url={previewPlaybackState.url ?? undefined}
                controls={false}
                width="100%"
                height="100%"
                autoplay={true}
                playing={previewPlaybackState.playing}
                volume={MetaScreenPlayerMuted ? 0 : 0.5}
                muted={MetaScreenPlayerMuted}
                onEnded={() => {
                  setPreviewPlaybackState({
                    url: "",
                    playing: false,
                  });
                }}
                pip={false}
                config={{
                  file: {
                    attributes: { disablePictureInPicture: true },
                  },
                }}
              />
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
              opacity: 0,
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
            <IconButton
              size="small"
              sx={{
                backgroundColor: "rgba(18, 25, 39, 0.55)",
                backdropFilter: "blur(12px)",
                border: "1px solid rgba(255,255,255,0.15)",
                color: "#fff",
                width: "30px",
                height: "30px",
                pointerEvents: "auto",
                transition: "background-color 0.2s ease",
                "&:hover": {
                  backgroundColor: "rgba(18, 25, 39, 0.8)",
                },
              }}
              disabled={playButtonLoading}
              onClick={async (e) => {
                e.stopPropagation();
                await handlePlay();
              }}
            >
              {playButtonLoading ? (
                <CircularProgress size={14} color="inherit" />
              ) : (
                <PlayArrowRounded sx={{ fontSize: "18px" }} />
              )}
            </IconButton>

            <WatchListButton item={item} />
          </Box>

          {/* Mute button for preview */}
          {previewEnabled && (
            <IconButton
              size="small"
              sx={{
                backgroundColor: "rgba(18, 25, 39, 0.55)",
                backdropFilter: "blur(12px)",
                border: "1px solid rgba(255,255,255,0.15)",
                opacity: previewPlaybackState.url ? 1 : 0,
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

                usePreviewPlayer.setState((state) => ({
                  MetaScreenPlayerMuted: !state.MetaScreenPlayerMuted,
                }));
              }}
            >
              {MetaScreenPlayerMuted ? (
                <VolumeOffRounded sx={{ fontSize: "12px" }} />
              ) : (
                <VolumeUpRounded sx={{ fontSize: "12px" }} />
              )}
            </IconButton>
          )}

          {/* Watched badge */}
          {((item.type === "show" && item.leafCount === item.viewedLeafCount) ||
            (item.type === "movie" &&
              item?.viewCount !== undefined &&
              item.viewCount > 0)) && (
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
                left: previewPlaybackState.url ? "40px" : "8px",
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
        {(item.type === "episode" ||
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
    </>
  );
}

export default memo(MovieItem);

function MediaTypePlaceholder({ type }: { type: string }) {
  const sx = { fontSize: "clamp(38px, 6vw, 72px)" };

  if (["show", "season", "episode"].includes(type)) return <TvRounded sx={sx} />;
  if (["artist", "album", "track"].includes(type)) return <MusicNoteRounded sx={sx} />;
  if (type === "photo") return <PhotoOutlined sx={sx} />;
  if (["movie", "video"].includes(type)) return <MovieOutlined sx={sx} />;
  return <VideoLibraryOutlined sx={sx} />;
}

export function WatchListButton({ item }: { item: MovieItemData }) {
  const WatchList = useWatchListCache();
  const [isLoading, setIsLoading] = React.useState(false);

  return (
    <IconButton
      size="small"
      sx={{
        backgroundColor: "rgba(18, 25, 39, 0.55)",
        backdropFilter: "blur(12px)",
        border: "1px solid rgba(255,255,255,0.15)",
        color: "#fff",
        width: "30px",
        height: "30px",
        pointerEvents: "auto",
        transition: "background-color 0.2s ease",
        "&:hover": {
          backgroundColor: "rgba(18, 25, 39, 0.8)",
        },
      }}
      onClick={(e) => {
        e.stopPropagation();
        if (!item || isLoading) return;
        setIsLoading(true);

        WatchListCacheEmitter.once("watchListUpdate", () => {
          setIsLoading(false);
        });

        if (WatchList.isOnWatchList(item.guid))
          return WatchList.removeItem(item.guid);

        WatchList.addItem(item as Plex.Metadata);
      }}
    >
      {isLoading ? (
        <CircularProgress size={12} color="inherit" />
      ) : (
        <>
          {WatchList.isOnWatchList(item.guid) ? (
            <BookmarkRounded sx={{ fontSize: "16px" }} />
          ) : (
            <BookmarkBorderRounded sx={{ fontSize: "16px" }} />
          )}
        </>
      )}
    </IconButton>
  );
}

export function HeroWatchListButton({ item }: { item: Plex.Metadata }) {
  const WatchList = useWatchListCache();
  const [isLoading, setIsLoading] = React.useState(false);

  const isOnWatchList = WatchList.isOnWatchList(item.guid);

  return (
    <Button
      variant="contained"
      sx={{
        fontWeight: "bold",
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        transition: "all 0.2s ease-in-out",
        height: "38.5px"
      }}
      onClick={(e) => {
        e.stopPropagation();
        if (!item || isLoading) return;
        setIsLoading(true);

        WatchListCacheEmitter.once("watchListUpdate", () => {
          setIsLoading(false);
        });

        if (isOnWatchList) return WatchList.removeItem(item.guid);

        WatchList.addItem(item);
      }}
    >
      {isLoading ? (
        <CircularProgress size={16} color="inherit" />
      ) : (
        <>
          {isOnWatchList ? (
            <BookmarkRounded fontSize="small" />
          ) : (
            <BookmarkBorderRounded fontSize="small" />
          )}
        </>
      )}
    </Button>
  );
}
