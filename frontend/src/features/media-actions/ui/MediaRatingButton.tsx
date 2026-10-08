import {
  CloseRounded,
  StarOutlineRounded,
  StarRounded,
} from "@mui/icons-material";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  IconButton,
  Popover,
  Rating,
  Typography,
} from "@mui/material";
import React, { useEffect, useImperativeHandle, useRef, useState } from "react";
import {
  formatMediaRating,
  validMediaRating,
  type MediaItemData,
} from "entities/media/model";
import { useActiveServerScope, useAuthSession } from "features/session/model";
import { setMediaRating } from "../api/rating";
import { overlayContainer } from "shared/lib/overlayContainer";

interface RatingButtonProps {
  item: Pick<MediaItemData, "ratingKey" | "userRating">;
  onChanged: (rating: number | undefined) => void;
  menuRef?: React.Ref<{ open: (anchor: HTMLElement) => void }>;
  onWriteReview?: () => void;
  hideButton?: boolean;
}

export default function MediaRatingButton(props: RatingButtonProps) {
  const revision = useAuthSession((state) => state.revision);
  const { serverId } = useActiveServerScope();
  return (
    <RatingControls
      key={`${serverId}:${revision}:${props.item.ratingKey}`}
      {...props}
    />
  );
}

function RatingControls({
  item,
  onChanged,
  menuRef,
  onWriteReview,
  hideButton = false,
}: RatingButtonProps) {
  const rating =
    validMediaRating(item.userRating) && item.userRating > 0
      ? item.userRating / 2
      : null;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const paper = useRef<HTMLDivElement>(null);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  useImperativeHandle(menuRef, () => ({ open: setAnchor }), []);

  const saveRating = async (value: number | null) => {
    if (request.current || (value === null && rating === null)) return;
    const controller = new AbortController();
    request.current = controller;
    // Keep keyboard focus inside the dialog while its controls are disabled.
    if (paper.current?.contains(document.activeElement)) paper.current.focus();
    setSaving(true);
    setError(null);
    try {
      if (
        !(await setMediaRating(
          value === null ? -1 : value * 2,
          item.ratingKey,
          controller.signal,
        ))
      )
        throw new Error("Plex could not save your rating.");
      if (controller.signal.aborted) return;
      onChanged(value === null ? undefined : value * 2);
    } catch {
      if (!controller.signal.aborted)
        setError("Plex could not save your rating. Try again.");
    } finally {
      request.current = null;
      if (!controller.signal.aborted) setSaving(false);
    }
  };

  return (
    <>
      <Popover
        container={overlayContainer}
        onKeyDown={(event) => {
          if (event.key.startsWith("Arrow")) event.stopPropagation();
        }}
        anchorEl={anchor}
        open={anchor !== null}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
        transformOrigin={{ vertical: "bottom", horizontal: "center" }}
        slotProps={{
          paper: {
            ref: paper,
            sx: {
              p: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 1,
            },
          },
        }}
      >
        <Typography variant="body2" color="text.secondary">
          {rating === null
            ? "Your rating"
            : `Your rating: ${formatMediaRating(rating * 2)}`}
        </Typography>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Rating
            value={rating}
            precision={0.5}
            size="large"
            getLabelText={(value) => formatMediaRating(value * 2)}
            disabled={saving}
            onChange={(_, value) => void saveRating(value)}
            onClick={(event) => event.stopPropagation()}
            onContextMenu={(event) => {
              event.preventDefault();
              void saveRating(null);
            }}
          />
          <IconButton
            size="small"
            aria-label="Clear rating"
            disabled={saving || rating === null}
            onClick={() => void saveRating(null)}
          >
            <CloseRounded fontSize="small" />
          </IconButton>
        </Box>
        {saving && <CircularProgress size={16} />}
        {error && <Alert severity="error">{error}</Alert>}
        {onWriteReview && (
          <Button
            fullWidth
            disabled={saving}
            onClick={() => {
              setAnchor(null);
              onWriteReview();
            }}
          >
            Write your own review
          </Button>
        )}
      </Popover>
      {!hideButton && (
        <Button
          variant="contained"
          aria-label={
            rating
              ? `Your rating: ${formatMediaRating(rating * 2)}`
              : "Rate this title"
          }
          sx={{ height: 38, minWidth: 38, px: 1 }}
          onClick={(event) => setAnchor(event.currentTarget)}
          onContextMenu={(event) => {
            event.preventDefault();
            setAnchor(event.currentTarget);
            void saveRating(null);
          }}
        >
          {rating ? (
            <StarRounded fontSize="small" />
          ) : (
            <StarOutlineRounded fontSize="small" />
          )}
        </Button>
      )}
    </>
  );
}
