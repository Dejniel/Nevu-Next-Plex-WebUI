import {
  AutoFixHighRounded,
  CheckCircleOutlineRounded,
  CheckCircleRounded,
  EditRounded,
  PlayArrowRounded,
} from "@mui/icons-material";
import { Button, CircularProgress, IconButton, Tooltip } from "@mui/material";
import { applyMediaWatchedState, isMediaWatched, setMediaPlayedStatus } from "entities/media/model";
import {
  matchActionLabel,
  OriginalDownloadButton,
  resolvePlaybackTarget,
  type MediaActionCapabilities,
} from "features/media-actions/public";
import { HeroWatchlistButton } from "features/watchlist/public";
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useBigReader, useConfirmModal } from "shared/ui";
import TitleRatingButton from "./TitleRatingButton";

const iconButtonStyle = {
  width: 38,
  height: 38,
  borderRadius: 1,
  bgcolor: "rgba(18, 25, 39, 0.8)",
  border: "1px solid rgba(255,255,255,0.2)",
};

export default function TitlePrimaryActions({
  capabilities,
  data,
  onDataChanged,
  onEditMetadata,
  onMatch,
  onReviewChanged,
}: {
  capabilities: MediaActionCapabilities;
  data: Plex.Metadata;
  onDataChanged: (data: Plex.Metadata) => void;
  onEditMetadata: () => void;
  onMatch: () => void;
  onReviewChanged: () => void;
}) {
  const navigate = useNavigate();
  const [playLoading, setPlayLoading] = useState(false);
  const watched = isMediaWatched(data);

  const play = async () => {
    if (playLoading) return;
    setPlayLoading(true);
    try {
      const target = await resolvePlaybackTarget(data);
      if (target.path) navigate(target.path);
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
        onDataChanged(applyMediaWatchedState(data, nextWatched));
      },
      onCancel: () => undefined,
    });
  };

  return (
    <>
      <Button
        variant="contained"
        disabled={playLoading}
        onClick={() => void play()}
        startIcon={playLoading
          ? <CircularProgress size={17} color="inherit" />
          : <PlayArrowRounded fontSize="medium" />}
        sx={{ height: 38, fontWeight: 700 }}
      >
        Play
        {data.type === "show" && data.OnDeck?.Metadata &&
          ` ${data.Children?.size && data.Children.size > 1
            ? `S${data.OnDeck.Metadata.parentIndex}`
            : ""}E${data.OnDeck.Metadata.index}`}
      </Button>

      <OriginalDownloadButton data={data} canDownload={capabilities.canDownload} />

      <Tooltip placement="top" arrow title="Watchlist">
        <HeroWatchlistButton item={data} />
      </Tooltip>

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

      <TitleRatingButton item={data} onReviewChanged={onReviewChanged} />

      {capabilities.canSetWatched && <Tooltip
        placement="top"
        arrow
        title={`Mark as ${watched ? "unwatched" : "watched"}`}
      >
        <IconButton
          aria-label={`Mark as ${watched ? "unwatched" : "watched"}`}
          onClick={toggleWatched}
          sx={iconButtonStyle}
        >
          {watched
            ? <CheckCircleRounded fontSize="small" />
            : <CheckCircleOutlineRounded fontSize="small" />}
        </IconButton>
      </Tooltip>}
    </>
  );
}
