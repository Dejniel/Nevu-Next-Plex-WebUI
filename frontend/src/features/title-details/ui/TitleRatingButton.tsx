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
} from "@mui/material";
import React, { useImperativeHandle, useState } from "react";
import { setMediaRating } from "../api/rating";

export default function TitleRatingButton({
  item,
  onChanged,
  menuRef,
  onWriteReview,
}: {
  item: Plex.Metadata;
  onChanged: (item: Plex.Metadata) => void;
  menuRef?: React.Ref<{ open: (anchor: HTMLElement) => void }>;
  onWriteReview?: () => void;
}) {
  const rating = item.userRating ? item.userRating / 2 : null;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  useImperativeHandle(menuRef, () => ({ open: setAnchor }), []);

  const saveRating = async (value: number | null) => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      if (
        !(await setMediaRating(value === null ? -1 : value * 2, item.ratingKey))
      )
        throw new Error("Plex could not save your rating.");
      onChanged({
        ...item,
        userRating: value === null ? undefined : value * 2,
      });
    } catch {
      setError("Plex could not save your rating. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Popover
        anchorEl={anchor}
        open={anchor !== null}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
        transformOrigin={{ vertical: "bottom", horizontal: "center" }}
        slotProps={{
          paper: {
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
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Rating
            value={rating}
            precision={0.5}
            size="large"
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
            onClick={() => {
              setAnchor(null);
              onWriteReview();
            }}
          >
            Write your own review
          </Button>
        )}
      </Popover>
      <Button
        variant="contained"
        aria-label={rating ? `Your rating: ${rating} stars` : "Rate this title"}
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
    </>
  );
}
