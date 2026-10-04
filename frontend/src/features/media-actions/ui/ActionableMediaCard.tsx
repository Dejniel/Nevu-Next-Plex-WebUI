import { MoreVertRounded, PlayArrowRounded } from "@mui/icons-material";
import { CircularProgress, IconButton, Tooltip } from "@mui/material";
import { MediaCard, type MediaCardProps } from "entities/media/public";
import { applyMediaWatchedState, setMediaPlayedStatus } from "entities/media/model";
import { useCanManageServer, useServerSession } from "features/session/public";
import { WatchlistButton } from "features/watchlist/public";
import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { mediaDetailsTo } from "shared/lib/navigation";
import { useBigReader, useConfirmModal } from "shared/ui";
import { getOriginalDownloads } from "../model/downloads";
import { resolvePlaybackTarget } from "../model/playbackTarget";
import { getMediaActionCapabilities } from "../model/mediaActionCapabilities";
import {
  StaleMediaMetadataRequestError,
  useLazyMediaMetadata,
} from "../model/useLazyMediaMetadata";
import { applyMetadataUpdate } from "../api/metadata";
import { unmatchMetadata } from "../api/matching";
import EditMetadataDialog from "./EditMetadataDialog";
import MatchMetadataDialog from "./MatchMetadataDialog";
import MediaActionsMenu, {
  MediaMenuAnchor,
} from "./MediaActionsMenu";

const controlStyle = {
  backgroundColor: "rgba(18, 25, 39, 0.55)",
  backdropFilter: "blur(12px)",
  border: "1px solid rgba(255,255,255,0.15)",
  color: "#fff",
  width: 30,
  height: 30,
  pointerEvents: "auto",
  transition: "background-color 0.2s ease",
  "&:hover": { backgroundColor: "rgba(18, 25, 39, 0.8)" },
} as const;

export type ActionableMediaCardProps = Omit<
  MediaCardProps,
  "item" | "overlayActions" | "onContextMenu"
> & Pick<MediaCardProps, "item"> & {
  refetchData?: () => void;
  canPlay?: boolean;
};

export default function ActionableMediaCard({
  item,
  PlexTvSource = false,
  refetchData,
  canPlay = true,
  ...cardProps
}: ActionableMediaCardProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const canManageServer = useCanManageServer();
  const allowDownloads = useServerSession(
    (state) => state.server?.allowSync === true,
  );
  const [displayItem, setDisplayItem] = useState(item);
  const [anchor, setAnchor] = useState<MediaMenuAnchor | null>(null);
  const [playLoading, setPlayLoading] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [matchOpen, setMatchOpen] = useState(false);
  const {
    data: fullMetadata,
    status: metadataStatus,
    load: loadFullMetadata,
    invalidate: invalidateMetadata,
    update: updateMetadata,
  } = useLazyMediaMetadata(item);
  const capabilities = getMediaActionCapabilities(displayItem, {
    localItem: !PlexTvSource,
    canManageServer,
    allowDownloads,
  });

  useEffect(() => {
    setDisplayItem(item);
    setEditOpen(false);
    setMatchOpen(false);
  }, [item]);

  const menuOpen = anchor !== null;
  const openMenu = (nextAnchor: MediaMenuAnchor) => {
    setAnchor(nextAnchor);
    if (
      (!capabilities.canEditMetadata && !capabilities.canDownload) ||
      metadataStatus === "loading" ||
      metadataStatus === "loaded"
    ) return;
    void loadFullMetadata().catch(() => undefined);
  };

  const detailsTarget = mediaDetailsTo(location, displayItem, PlexTvSource, {
    exactItem: true,
    tab: "media",
  });
  const downloads = useMemo(
    () => fullMetadata ? getOriginalDownloads(fullMetadata, capabilities.canDownload) : [],
    [capabilities.canDownload, fullMetadata],
  );

  const play = async () => {
    if (playLoading || !canPlay) return;
    setPlayLoading(true);
    try {
      const target = await resolvePlaybackTarget(displayItem, PlexTvSource);
      if (target.path !== null) navigate(target.path);
      else useBigReader.getState().setBigReader(target.message);
    } catch {
      useBigReader.getState().setBigReader("Nevu could not start playback.");
    } finally {
      setPlayLoading(false);
    }
  };

  const setWatched = (watched: boolean) => {
    useConfirmModal.getState().setModal({
      title: `Mark as ${watched ? "Watched" : "Unwatched"}`,
      message: `Are you sure you want to mark "${displayItem.title}" as ${
        watched ? "Watched" : "Unwatched"
      }?`,
      onConfirm: async () => {
        try {
          await setMediaPlayedStatus(watched, displayItem.ratingKey);
          if (fullMetadata) updateMetadata(applyMediaWatchedState(fullMetadata, watched));
          else invalidateMetadata();
          setDisplayItem((current) => applyMediaWatchedState(current, watched));
          refetchData?.();
        } catch (error) {
          if (error instanceof StaleMediaMetadataRequestError) return;
          useBigReader.getState().setBigReader("Plex could not update this item's watched state.");
        }
      },
      onCancel: () => undefined,
    });
  };

  const editMetadata = async () => {
    try {
      await loadFullMetadata();
      setEditOpen(true);
    } catch (error) {
      if (error instanceof StaleMediaMetadataRequestError) return;
      useBigReader.getState().setBigReader(
        "Nevu could not load this item's editable metadata.",
      );
    }
  };

  const unmatch = () => {
    useConfirmModal.getState().setModal({
      title: "Unmatch metadata",
      message: `Remove the current metadata match from "${displayItem.title}"?`,
      onConfirm: async () => {
        try {
          invalidateMetadata();
          await unmatchMetadata(displayItem.ratingKey);
          // Discard any metadata loaded while Plex was still unmatching.
          invalidateMetadata();
          const metadata = await loadFullMetadata();
          setDisplayItem(metadata);
          refetchData?.();
        } catch (error) {
          if (error instanceof StaleMediaMetadataRequestError) return;
          useBigReader.getState().setBigReader(
            "Plex could not unmatch this item.",
          );
        }
      },
      onCancel: () => undefined,
    });
  };

  const openContextMenu: React.MouseEventHandler<HTMLDivElement> = (event) => {
    event.preventDefault();
    event.stopPropagation();
    openMenu({ position: { top: event.clientY, left: event.clientX } });
  };

  return (
    <>
      <MediaCard
        {...cardProps}
        item={displayItem}
        PlexTvSource={PlexTvSource}
        onContextMenu={openContextMenu}
        overlayActions={
          <>
            <Tooltip title={canPlay ? "Play" : "Unavailable on this server"}>
              <span>
                <IconButton
                  size="small"
                  aria-label={`Play ${displayItem.title}`}
                  disabled={playLoading || !canPlay}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    void play();
                  }}
                  sx={controlStyle}
                >
                  {playLoading ? (
                    <CircularProgress size={14} color="inherit" />
                  ) : (
                    <PlayArrowRounded sx={{ fontSize: 18 }} />
                  )}
                </IconButton>
              </span>
            </Tooltip>
            <WatchlistButton item={displayItem} />
            <Tooltip title="More actions">
              <IconButton
                size="small"
                aria-label={`More actions for ${displayItem.title}`}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  openMenu({ element: event.currentTarget });
                }}
                sx={controlStyle}
              >
                <MoreVertRounded sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>
          </>
        }
      />

      {anchor && (
        <MediaActionsMenu
          anchor={anchor}
          capabilities={capabilities}
          detailsTarget={detailsTarget}
          downloads={downloads}
          downloadsLoading={
            capabilities.canDownload && metadataStatus === "loading"
          }
          item={displayItem}
          location={location}
          onClose={() => setAnchor(null)}
          onEditMetadata={() => void editMetadata()}
          onMatch={() => setMatchOpen(true)}
          onPlay={() => void play()}
          canPlay={canPlay}
          onSetWatched={setWatched}
          onUnmatch={unmatch}
        />
      )}

      {capabilities.canEditMetadata && editOpen && fullMetadata && (
        <EditMetadataDialog
          data={fullMetadata}
          open
          onClose={() => setEditOpen(false)}
          onSaved={(changes, lockChanges) => {
            const updated = applyMetadataUpdate(
              fullMetadata,
              changes,
              lockChanges,
            );
            updateMetadata(updated);
            setDisplayItem(updated);
            refetchData?.();
          }}
        />
      )}

      {capabilities.canMatch && matchOpen && (
        <MatchMetadataDialog
          item={displayItem}
          open
          onClose={() => setMatchOpen(false)}
          onMatched={(candidate) => {
            invalidateMetadata();
            setDisplayItem((current) => ({
              ...current,
              guid: candidate.guid,
              title: candidate.name,
              ...(candidate.year !== undefined ? { year: candidate.year } : {}),
            }));
            refetchData?.();
          }}
        />
      )}
    </>
  );
}
