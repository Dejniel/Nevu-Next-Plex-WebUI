import { StarOutlineRounded, StarRounded } from "@mui/icons-material";
import { Button, Popover, Rating } from "@mui/material";
import React, { useImperativeHandle, useState } from "react";
import { setMediaRating } from "../api/rating";
import AddReviewDialog from "./AddReviewDialog";

export default function TitleRatingButton({
  item,
  onReviewChanged,
  menuRef,
}: {
  item: Plex.Metadata;
  onReviewChanged?: () => void;
  menuRef?: React.Ref<{ open: (anchor: HTMLElement) => void }>;
}) {
  const [rating, setRating] = useState<number | null>(
    (item.userRating && item.userRating / 2) ?? null,
  );
  const [reviewOpen, setReviewOpen] = useState(false);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  useImperativeHandle(menuRef, () => ({ open: setAnchor }), []);

  const clearRating = () => {
    setRating(null);
    item.userRating = undefined;
    void setMediaRating(-1, item.ratingKey);
  };

  return (
    <>
      {reviewOpen && (
        <AddReviewDialog
          item={item}
          onClose={() => setReviewOpen(false)}
          onChanged={(value) => {
            setRating(value);
            item.userRating = value ? value * 2 : undefined;
            onReviewChanged?.();
          }}
        />
      )}
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
        <Rating
          value={rating}
          precision={0.5}
          size="large"
          onChange={(_, value) => {
            setRating(value);
            if (value === null) return;
            item.userRating = value * 2;
            void setMediaRating(value * 2, item.ratingKey);
          }}
          onClick={(event) => event.stopPropagation()}
          onContextMenu={(event) => {
            event.preventDefault();
            clearRating();
          }}
        />
        <Button
          variant="contained"
          size="small"
          onClick={() => {
            setReviewOpen(true);
            setAnchor(null);
          }}
        >
          Add Review
        </Button>
      </Popover>
      <Button
        variant="contained"
        aria-label={rating ? `Your rating: ${rating} stars` : "Rate this title"}
        sx={{ height: 38, minWidth: 38, px: 1 }}
        onClick={(event) => setAnchor(event.currentTarget)}
        onContextMenu={(event) => {
          event.preventDefault();
          clearRating();
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
