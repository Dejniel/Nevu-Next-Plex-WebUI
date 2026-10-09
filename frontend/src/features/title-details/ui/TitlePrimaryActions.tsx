import {
  AutoFixHighRounded,
  CheckCircleOutlineRounded,
  CheckCircleRounded,
  EditRounded,
  PlayArrowRounded,
  MoreVertRounded,
  DownloadRounded,
  StarOutlineRounded,
} from "@mui/icons-material";
import {
  Button,
  Box,
  CircularProgress,
  Divider,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Tooltip,
} from "@mui/material";
import {
  applyMediaWatchedState,
  isMediaWatched,
  setMediaPlayedStatus,
} from "entities/media/model";
import {
  matchActionLabel,
  getOriginalDownloads,
  OriginalDownloadButton,
  MediaRatingButton,
  resolvePlaybackTarget,
  type MediaActionCapabilities,
  renderMetadataMatchingMenuItems,
} from "features/media-actions/public";
import {
  HeroWatchlistButton,
  WatchlistMenuItem,
} from "features/watchlist/public";
import {
  openMediaListDialog,
  renderMediaListMenuItems,
} from "features/media-lists/public";
import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useBigReader, useConfirmModal } from "shared/ui";
import { useActiveServerScope } from "features/session/model";
import { serverQueryClient } from "shared/api/queryClient";
import { titleReviewsQueryOptions } from "../model/titleReviewsQuery";
import { useTitleActionOverflow } from "../model/useTitleActionOverflow";
import type { TitleActionID } from "../model/titleActionOverflow";

const iconButtonStyle = {
  width: 38,
  height: 38,
  borderRadius: 1,
  bgcolor: "rgba(18, 25, 39, 0.8)",
  border: "1px solid rgba(255,255,255,0.2)",
};

function ActionSlot({
  id,
  hidden = false,
  children,
}: {
  id: TitleActionID | "play" | "more";
  hidden?: boolean;
  children: React.ReactNode;
}) {
  // Hidden controls stay mounted so resizing preserves their state and natural width.
  return (
    <Box
      component="span"
      data-overflow-item={id}
      aria-hidden={hidden || undefined}
      inert={hidden || undefined}
      sx={{
        display: "inline-flex",
        flexShrink: 0,
        width: "max-content",
        "&:empty": { display: "none" },
        ...(id === "play" && { maxWidth: "calc(100% - 54px)", minWidth: 0 }),
        ...(hidden && {
          position: "absolute",
          visibility: "hidden",
          pointerEvents: "none",
        }),
      }}
    >
      {children}
    </Box>
  );
}

export default function TitlePrimaryActions({
  capabilities,
  data,
  onDataChanged,
  onEditMetadata,
  onMatch,
  onWriteReview,
}: {
  capabilities: MediaActionCapabilities;
  data: Plex.Metadata;
  onDataChanged: React.Dispatch<
    React.SetStateAction<Plex.Metadata | undefined>
  >;
  onEditMetadata: () => void;
  onMatch: () => void;
  onWriteReview?: () => void;
}) {
  const navigate = useNavigate();
  const scope = useActiveServerScope();
  const [playLoading, setPlayLoading] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const downloadMenuRef = useRef<{ open: (anchor: HTMLElement) => void }>(null);
  const ratingMenuRef = useRef<{ open: (anchor: HTMLElement) => void }>(null);
  const hasMenuActions =
    capabilities.canAddToPlaylist || capabilities.canAddToCollection || capabilities.canUnmatch;
  const { toolbarRef, overflow } = useTitleActionOverflow(hasMenuActions);
  const hidden = (id: TitleActionID) => overflow.includes(id);
  const downloads = getOriginalDownloads(data, capabilities.canDownload);
  useEffect(() => {
    setMenuAnchor(null);
  }, [data.ratingKey]);
  const watched = isMediaWatched(data);

  const play = async () => {
    if (playLoading) return;
    setPlayLoading(true);
    try {
      const target = await resolvePlaybackTarget(data);
      if (target.path !== null) navigate(target.path);
      else useBigReader.getState().setBigReader(target.message);
    } catch {
      useBigReader.getState().setBigReader("Nevu could not start playback.");
    } finally {
      setPlayLoading(false);
    }
  };

  const toggleWatched = () => {
    const nextWatched = !watched;
    useConfirmModal.getState().setModal({
      title: `Mark as ${nextWatched ? "watched" : "unwatched"}`,
      message: `Are you sure you want to mark "${data.title}" as ${
        nextWatched ? "watched" : "unwatched"
      }?`,
      onConfirm: async () => {
        await setMediaPlayedStatus(nextWatched, data.ratingKey);
        onDataChanged(
          (current) => current && applyMediaWatchedState(current, nextWatched),
        );
      },
      onCancel: () => undefined,
    });
  };

  return (
    <Box
      ref={toolbarRef}
      role="group"
      aria-label={`Actions for ${data.title}`}
      sx={{
        position: "relative",
        display: "flex",
        width: "100%",
        minWidth: 0,
        alignItems: "center",
        justifyContent: { xs: "center", sm: "flex-start" },
        flexWrap: "nowrap",
        gap: { xs: 1, sm: 2 },
      }}
    >
      <ActionSlot id="play">
        <Button
          variant="contained"
          disabled={playLoading}
          onClick={() => void play()}
          startIcon={
            playLoading ? (
              <CircularProgress size={17} color="inherit" />
            ) : (
              <PlayArrowRounded fontSize="medium" />
            )
          }
          sx={{
            height: 38,
            fontWeight: 700,
            whiteSpace: "nowrap",
            maxWidth: "100%",
            overflow: "hidden",
          }}
        >
          Play
          {data.type === "show" &&
            data.OnDeck?.Metadata &&
            ` ${
              data.Children?.size && data.Children.size > 1
                ? `S${data.OnDeck.Metadata.parentIndex}`
                : ""
            }E${data.OnDeck.Metadata.index}`}
        </Button>
      </ActionSlot>

      <ActionSlot id="download" hidden={hidden("download")}>
        <OriginalDownloadButton
          data={data}
          canDownload={capabilities.canDownload}
          menuRef={downloadMenuRef}
        />
      </ActionSlot>

      <ActionSlot id="watchlist" hidden={hidden("watchlist")}>
        <HeroWatchlistButton item={data} />
      </ActionSlot>

      <ActionSlot id="edit" hidden={hidden("edit")}>
        {capabilities.canEditMetadata && (
          <Tooltip placement="top" arrow title="Edit metadata">
            <IconButton
              aria-label="Edit metadata"
              onClick={onEditMetadata}
              sx={iconButtonStyle}
            >
              <EditRounded fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </ActionSlot>

      <ActionSlot id="match" hidden={hidden("match")}>
        {capabilities.canMatch && (
          <Tooltip placement="top" arrow title={matchActionLabel(data)}>
            <IconButton
              aria-label={matchActionLabel(data)}
              onClick={onMatch}
              sx={iconButtonStyle}
            >
              <AutoFixHighRounded fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </ActionSlot>

      <ActionSlot id="rating" hidden={hidden("rating")}>
        <MediaRatingButton
          item={data}
          onChanged={(userRating) => {
            onDataChanged((current) => current && { ...current, userRating });
            const reviews = titleReviewsQueryOptions(
              scope.profileKey,
              data.guid,
            );
            if (reviews.enabled)
              void serverQueryClient.invalidateQueries({
                queryKey: reviews.queryKey,
                exact: true,
              });
          }}
          menuRef={ratingMenuRef}
          onWriteReview={onWriteReview}
        />
      </ActionSlot>

      <ActionSlot id="watched" hidden={hidden("watched")}>
        {capabilities.canSetWatched && (
          <Tooltip
            placement="top"
            arrow
            title={`Mark as ${watched ? "unwatched" : "watched"}`}
          >
            <IconButton
              aria-label={`Mark as ${watched ? "unwatched" : "watched"}`}
              onClick={toggleWatched}
              sx={iconButtonStyle}
            >
              {watched ? (
                <CheckCircleRounded fontSize="small" />
              ) : (
                <CheckCircleOutlineRounded fontSize="small" />
              )}
            </IconButton>
          </Tooltip>
        )}
      </ActionSlot>

      <ActionSlot id="more" hidden={!hasMenuActions && overflow.length === 0}>
        <Tooltip title="More actions">
          <IconButton
            aria-label={`More actions for ${data.title}`}
            aria-haspopup="menu"
            aria-expanded={Boolean(menuAnchor)}
            onClick={(event) => setMenuAnchor(event.currentTarget)}
            sx={iconButtonStyle}
          >
            <MoreVertRounded fontSize="small" />
          </IconButton>
        </Tooltip>
      </ActionSlot>
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={() => setMenuAnchor(null)}
      >
        {hidden("watchlist") && (
          <WatchlistMenuItem item={data} onDone={() => setMenuAnchor(null)} />
        )}
        {hidden("watched") && (
          <MenuItem
            onClick={() => {
              setMenuAnchor(null);
              toggleWatched();
            }}
          >
            <ListItemIcon>
              {watched ? <CheckCircleRounded /> : <CheckCircleOutlineRounded />}
            </ListItemIcon>
            <ListItemText>
              Mark as {watched ? "unwatched" : "watched"}
            </ListItemText>
          </MenuItem>
        )}
        {hidden("rating") && (
          <MenuItem
            onClick={() => {
              if (menuAnchor) ratingMenuRef.current?.open(menuAnchor);
              setMenuAnchor(null);
            }}
          >
            <ListItemIcon>
              <StarOutlineRounded />
            </ListItemIcon>
            <ListItemText>Rate / review</ListItemText>
          </MenuItem>
        )}
        {hidden("download") && (
          <MenuItem
            {...(downloads.length === 1
              ? {
                  component: "a",
                  href: downloads[0].href,
                  download: downloads[0].filename,
                }
              : {})}
            onClick={() => {
              if (downloads.length > 1 && menuAnchor)
                downloadMenuRef.current?.open(menuAnchor);
              setMenuAnchor(null);
            }}
          >
            <ListItemIcon>
              <DownloadRounded />
            </ListItemIcon>
            <ListItemText>
              {downloads.length > 1
                ? "Choose original file…"
                : "Download original file"}
            </ListItemText>
          </MenuItem>
        )}
        {hidden("edit") && (
          <MenuItem
            onClick={() => {
              setMenuAnchor(null);
              onEditMetadata();
            }}
          >
            <ListItemIcon>
              <EditRounded />
            </ListItemIcon>
            <ListItemText>Edit metadata</ListItemText>
          </MenuItem>
        )}
        {hidden("match") && (
          <MenuItem
            onClick={() => {
              setMenuAnchor(null);
              onMatch();
            }}
          >
            <ListItemIcon>
              <AutoFixHighRounded />
            </ListItemIcon>
            <ListItemText>{matchActionLabel(data)}</ListItemText>
          </MenuItem>
        )}
        {overflow.length > 0 && hasMenuActions && <Divider />}
        {renderMetadataMatchingMenuItems({ item: data, capabilities, onClose: () => setMenuAnchor(null), showMatch: false })}
        {renderMediaListMenuItems({
          capabilities,
          onSelect: (kind) => {
            setMenuAnchor(null);
            openMediaListDialog(kind, data);
          },
        })}
      </Menu>
    </Box>
  );
}
