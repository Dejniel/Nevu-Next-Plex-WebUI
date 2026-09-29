import { MoreVertRounded, PlayArrowRounded } from "@mui/icons-material";
import { CircularProgress, IconButton, Tooltip } from "@mui/material";
import { MediaCard, type MediaCardProps } from "entities/media/public";
import { getMediaMetadata, setMediaPlayedStatus } from "entities/media/model";
import { useCanManageServer, useServerSession } from "features/session/public";
import { WatchlistButton } from "features/watchlist/public";
import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { mediaDetailsTo } from "shared/lib/navigation";
import { useBigReader, useConfirmModal } from "shared/ui";
import { getOriginalDownloads } from "../model/downloads";
import { resolvePlaybackTarget } from "../model/playbackTarget";
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
};

export default function ActionableMediaCard({
  item,
  PlexTvSource = false,
  refetchData,
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
  const [matchOpen, setMatchOpen] = useState(false);
  const [fullMetadata, setFullMetadata] = useState<Plex.Metadata | null>(null);
  const [downloadStatus, setDownloadStatus] = useState<
    "idle" | "loading" | "loaded" | "failed"
  >("idle");
  const metadataRequest = React.useRef(0);

  useEffect(() => {
    metadataRequest.current += 1;
    setDisplayItem(item);
    setFullMetadata(null);
    setDownloadStatus("idle");

    return () => {
      metadataRequest.current += 1;
    };
  }, [item]);

  const menuOpen = anchor !== null;
  const openMenu = (nextAnchor: MediaMenuAnchor) => {
    setAnchor(nextAnchor);
    if (
      PlexTvSource ||
      !allowDownloads ||
      downloadStatus === "loading" ||
      downloadStatus === "loaded" ||
      !["movie", "episode"].includes(displayItem.type)
    ) return;

    setDownloadStatus("loading");
    const request = ++metadataRequest.current;
    void getMediaMetadata(displayItem.ratingKey)
      .then((metadata) => {
        if (request !== metadataRequest.current) return;
        setFullMetadata(metadata);
        setDownloadStatus("loaded");
      })
      .catch(() => {
        if (request === metadataRequest.current) setDownloadStatus("failed");
      });
  };

  const detailsTarget = mediaDetailsTo(location, displayItem, PlexTvSource);
  const downloads = useMemo(
    () => fullMetadata ? getOriginalDownloads(fullMetadata, allowDownloads) : [],
    [allowDownloads, fullMetadata],
  );

  const play = async () => {
    if (playLoading) return;
    setPlayLoading(true);
    try {
      const target = await resolvePlaybackTarget(displayItem, PlexTvSource);
      if (target.path) navigate(target.path);
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
        await setMediaPlayedStatus(watched, displayItem.ratingKey);
        setDisplayItem((current) => current.type === "show"
          ? { ...current, viewedLeafCount: watched ? current.leafCount : 0 }
          : { ...current, viewCount: watched ? 1 : 0 });
        refetchData?.();
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
            <Tooltip title="Play">
              <span>
                <IconButton
                  size="small"
                  aria-label={`Play ${displayItem.title}`}
                  disabled={playLoading}
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
          canManageServer={canManageServer}
          detailsTarget={detailsTarget}
          downloads={downloads}
          downloadsLoading={downloadStatus === "loading"}
          item={displayItem}
          location={location}
          localItem={!PlexTvSource}
          onClose={() => setAnchor(null)}
          onMatch={() => setMatchOpen(true)}
          onPlay={() => void play()}
          onSetWatched={setWatched}
        />
      )}

      {!PlexTvSource && matchOpen && (
        <MatchMetadataDialog
          item={displayItem}
          open
          onClose={() => setMatchOpen(false)}
          onMatched={(candidate) => {
            metadataRequest.current += 1;
            setDisplayItem((current) => ({
              ...current,
              guid: candidate.guid,
              title: candidate.name,
              year: candidate.year ?? current.year,
            }));
            setFullMetadata(null);
            setDownloadStatus("idle");
            refetchData?.();
          }}
        />
      )}
    </>
  );
}
