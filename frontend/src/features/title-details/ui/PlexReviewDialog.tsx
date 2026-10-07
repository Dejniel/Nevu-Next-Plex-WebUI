import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Button,
  Checkbox,
  FormControlLabel,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { AppDialog } from "shared/ui";
import { savePlexReview, type PlexReview } from "../api/plexCommunity";
import { getReviewRating } from "../model/titleReviews";

export default function PlexReviewDialog({
  metadataID,
  review,
  onClose,
  onSaved,
}: {
  metadataID: string;
  review: PlexReview | null;
  onClose: () => void;
  onSaved: (review: PlexReview) => void | Promise<void>;
}) {
  const [message, setMessage] = useState(review?.message || "");
  const [hasSpoilers, setHasSpoilers] = useState(review?.hasSpoilers || false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pendingRequest = useRef<AbortController | null>(null);
  useEffect(() => () => pendingRequest.current?.abort(), []);

  const save = async () => {
    if (pendingRequest.current || !message.trim()) return;
    const controller = new AbortController();
    pendingRequest.current = controller;
    setSaving(true);
    setError(null);
    try {
      const result = await savePlexReview(
        {
          metadata: metadataID,
          message: message.trim(),
          hasSpoilers,
          rating: review ? (getReviewRating(review) ?? null) : null,
        },
        review?.id,
        controller.signal,
      );
      if (!controller.signal.aborted) await onSaved(result);
    } catch (error) {
      if (!controller.signal.aborted)
        setError(
          error instanceof Error
            ? error.message
            : "Plex could not save your review. Try again.",
        );
    } finally {
      if (pendingRequest.current === controller) pendingRequest.current = null;
      if (!controller.signal.aborted) setSaving(false);
    }
  };

  return (
    <AppDialog
      open
      title={review?.message ? "Edit review" : "Write a review"}
      onClose={onClose}
      busy={saving}
      actions={
        <Button
          variant="contained"
          disabled={saving || !message.trim()}
          onClick={() => void save()}
        >
          {saving ? "Saving…" : "Save review"}
        </Button>
      }
    >
      <Stack spacing={2}>
        {error && <Alert severity="error">{error}</Alert>}
        <TextField
          label="Your review"
          autoFocus
          fullWidth
          multiline
          minRows={4}
          value={message}
          disabled={saving}
          onChange={(event) => setMessage(event.target.value)}
        />
        <FormControlLabel
          control={
            <Checkbox
              checked={hasSpoilers}
              disabled={saving}
              onChange={(event) => setHasSpoilers(event.target.checked)}
            />
          }
          label="Contains spoilers"
        />
        <Typography variant="body2" color="text.secondary">
          Shared according to your Plex profile privacy settings. Your rating
          stays unchanged.
        </Typography>
      </Stack>
    </AppDialog>
  );
}
