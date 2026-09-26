import React, { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Divider,
  FormControlLabel,
  MenuItem,
  Modal,
  Rating,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { Star, StarBorder } from "@mui/icons-material";
import {
  deleteNevuReview,
  getNevuReviews,
  updateNevuReview,
} from "../../common/NevuReviews";
import { config } from "../../index";
import { setMediaRating } from "../../plex";
import { useUserSessionStore } from "../../states/UserSession";

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function storedReviewText(message?: string) {
  return message === "No text provided" || message === "No review text provided"
    ? ""
    : message || "";
}

function AddReviewModal({
  item,
  onClose,
  onChanged,
}: {
  item: Plex.Metadata;
  onClose: () => void;
  onChanged?: (rating: number | null) => void;
}) {
  const [initialLoading, setInitialLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [existingReview, setExistingReview] =
    useState<PerPlexed.Reviews.Review | null>(null);
  const [rating, setRating] = useState((item.userRating || 0) / 2);
  const [reviewText, setReviewText] = useState("");
  const [isSpoiler, setIsSpoiler] = useState(false);
  const [visibility, setVisibility] =
    useState<PerPlexed.Reviews.Visibility>("LOCAL");

  useEffect(() => {
    let cancelled = false;

    async function fetchReview() {
      if (!item.ratingKey || !item.guid) {
        setOperationError("This item does not have the identifiers needed for reviews.");
        setInitialLoading(false);
        return;
      }

      try {
        const reviews = await getNevuReviews(
          item.guid,
          useUserSessionStore.getState().user?.uuid,
        );
        if (cancelled) return;
        const review =
          reviews.find(({ visibility }) => visibility === "LOCAL") || reviews[0];
        setExistingReview(review || null);
        setRating((review?.rating ?? item.userRating ?? 0) / 2);
        setReviewText(storedReviewText(review?.message));
        setIsSpoiler(review?.spoilers || false);
        setVisibility(review?.visibility || "LOCAL");
      } catch (error) {
        if (!cancelled)
          setOperationError(errorMessage(error, "Could not load your review."));
      } finally {
        if (!cancelled) setInitialLoading(false);
      }
    }

    fetchReview();
    return () => {
      cancelled = true;
    };
  }, [item.guid, item.ratingKey, item.userRating]);

  const handleSave = async () => {
    const message = reviewText.trim();
    if (!message && rating === 0) {
      setOperationError("Add a rating or review text before saving.");
      return;
    }

    setSubmitting(true);
    setOperationError(null);
    const plexRating = rating > 0 ? rating * 2 : -1;

    try {
      const ratingSaved = await setMediaRating(plexRating, item.ratingKey);
      if (!ratingSaved) {
        setOperationError("Plex could not save the rating. The review was not changed.");
        return;
      }

      try {
        await updateNevuReview(
          item.guid,
          rating * 2,
          message,
          existingReview?.visibility || visibility,
          isSpoiler,
        );
      } catch (error) {
        setOperationError(
          `The rating was saved in Plex, but the review was not: ${errorMessage(
            error,
            "Nevu could not save the review.",
          )}`,
        );
        return;
      }

      onChanged?.(rating || null);
      onClose();
    } catch (error) {
      setOperationError(errorMessage(error, "Plex could not save the rating."));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!existingReview) return;
    setSubmitting(true);
    setOperationError(null);

    try {
      await deleteNevuReview(existingReview.itemID, existingReview.visibility);
    } catch (error) {
      setOperationError(errorMessage(error, "Could not delete the review."));
      setSubmitting(false);
      return;
    }

    setExistingReview(null);
    try {
      const ratingCleared = await setMediaRating(-1, item.ratingKey);
      if (!ratingCleared)
        throw new Error("Plex did not accept the rating change.");
      onChanged?.(null);
      onClose();
    } catch (error) {
      setOperationError(
        `The review was deleted, but Plex could not clear its rating: ${errorMessage(
          error,
          "Request failed.",
        )}`,
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open onClose={submitting ? undefined : onClose} aria-labelledby="review-modal-title">
      <Box
        sx={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: { xs: "calc(100% - 32px)", sm: 500 },
          maxHeight: "calc(100vh - 32px)",
          overflowY: "auto",
          bgcolor: "background.paper",
          borderRadius: 2,
          boxShadow: 24,
          p: { xs: 3, sm: 4 },
        }}
      >
        {initialLoading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
            <CircularProgress />
          </Box>
        ) : (
          <>
            <Typography id="review-modal-title" variant="h6" component="h2" gutterBottom>
              {existingReview ? "Edit Review" : "Add Review"}
            </Typography>
            <Typography variant="subtitle1" color="text.secondary" gutterBottom>
              {item.title}
            </Typography>
            <Divider sx={{ my: 2 }} />

            <Stack spacing={3}>
              {operationError && <Alert severity="error">{operationError}</Alert>}

              <Box>
                <Typography component="legend" gutterBottom>
                  Plex rating
                </Typography>
                <Rating
                  name="review-rating"
                  value={rating}
                  precision={0.5}
                  size="large"
                  disabled={submitting}
                  onChange={(_, newValue) => setRating(newValue || 0)}
                  icon={<Star fontSize="inherit" />}
                  emptyIcon={<StarBorder fontSize="inherit" />}
                />
              </Box>

              <TextField
                label="Review (optional)"
                multiline
                rows={4}
                value={reviewText}
                disabled={submitting}
                onChange={(event) => setReviewText(event.target.value)}
                placeholder="Share your thoughts about this item..."
                helperText={`${reviewText.length}/256`}
                slotProps={{ htmlInput: { maxLength: 256 } }}
                fullWidth
              />

              <FormControlLabel
                control={
                  <Checkbox
                    checked={isSpoiler}
                    disabled={submitting}
                    onChange={(event) => setIsSpoiler(event.target.checked)}
                  />
                }
                label="Contains spoilers"
              />

              {!existingReview && (
                <>
                  <Divider />
                  <Typography variant="subtitle1">Who can see this review?</Typography>
                  <Select
                    value={visibility}
                    disabled={submitting}
                    onChange={(event) =>
                      setVisibility(event.target.value as PerPlexed.Reviews.Visibility)
                    }
                    fullWidth
                    inputProps={{ "aria-label": "Review visibility" }}
                  >
                    <MenuItem value="LOCAL">This Nevu server</MenuItem>
                    <MenuItem
                      value="GLOBAL"
                      disabled={config.DISABLE_GLOBAL_REVIEWS}
                    >
                      Nevu Community
                    </MenuItem>
                  </Select>
                </>
              )}

              <Stack
                direction={{ xs: "column-reverse", sm: "row" }}
                justifyContent={existingReview ? "space-between" : "flex-end"}
                gap={2}
              >
                {existingReview && (
                  <Button
                    variant="outlined"
                    onClick={handleDelete}
                    color="error"
                    disabled={submitting}
                  >
                    Delete
                  </Button>
                )}
                <Stack direction="row" spacing={2} justifyContent="flex-end">
                  <Button variant="outlined" onClick={onClose} disabled={submitting}>
                    Cancel
                  </Button>
                  <Button
                    variant="contained"
                    onClick={handleSave}
                    disabled={submitting}
                    startIcon={submitting ? <CircularProgress size={16} /> : undefined}
                  >
                    Save
                  </Button>
                </Stack>
              </Stack>
            </Stack>
          </>
        )}
      </Box>
    </Modal>
  );
}

export default AddReviewModal;
