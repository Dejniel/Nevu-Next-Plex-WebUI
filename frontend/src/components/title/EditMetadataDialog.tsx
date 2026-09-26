import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
} from "@mui/material";
import React, { useEffect, useMemo, useState } from "react";
import { MetadataUpdate, updateMetadata } from "../../plex/metadata";

interface MetadataDraft {
  title: string;
  sortTitle: string;
  originalTitle: string;
  summary: string;
  tagline: string;
  studio: string;
  contentRating: string;
  originallyAvailableAt: string;
  year: string;
}

function draftFromMetadata(data: Plex.Metadata): MetadataDraft {
  return {
    title: data.title || "",
    sortTitle: data.titleSort || "",
    originalTitle: data.originalTitle || "",
    summary: data.summary || "",
    tagline: data.tagline || "",
    studio: data.studio || "",
    contentRating: data.contentRating || "",
    originallyAvailableAt: data.originallyAvailableAt || "",
    year: data.year ? String(data.year) : "",
  };
}

function changedFields(
  initial: MetadataDraft,
  draft: MetadataDraft,
): MetadataUpdate {
  return Object.fromEntries(
    Object.entries(draft).filter(
      ([field, value]) => value !== initial[field as keyof MetadataDraft],
    ),
  ) as MetadataUpdate;
}

export default function EditMetadataDialog({
  data,
  open,
  onClose,
  onSaved,
}: {
  data: Plex.Metadata;
  open: boolean;
  onClose: () => void;
  onSaved: (changes: MetadataUpdate) => void;
}) {
  const initial = useMemo(() => draftFromMetadata(data), [data]);
  const [draft, setDraft] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setDraft(initial);
      setError(null);
    }
  }, [initial, open]);

  const changes = changedFields(initial, draft);
  const dirty = Object.keys(changes).length > 0;
  const year = draft.year ? Number(draft.year) : null;
  const invalidYear =
    year !== null &&
    (!Number.isInteger(year) || year < 1800 || year > new Date().getFullYear() + 10);
  const invalidTitle = draft.title.trim().length === 0;

  const setField = (field: keyof MetadataDraft, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }));
  };

  const save = async () => {
    if (!dirty || invalidTitle || invalidYear) return;
    setSaving(true);
    setError(null);

    const normalized: MetadataUpdate = { ...changes };
    if (normalized.title !== undefined)
      normalized.title = normalized.title.trim();
    if (normalized.year !== undefined) normalized.year = normalized.year.trim();

    try {
      await updateMetadata(data.ratingKey, normalized);
      onSaved(normalized);
      onClose();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Nevu could not update this item.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={() => !saving && onClose()}
      fullWidth
      maxWidth="sm"
    >
      <DialogTitle>Edit metadata</DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
            gap: 2,
            pt: 1,
          }}
        >
          <TextField
            autoFocus
            required
            label="Title"
            value={draft.title}
            disabled={saving}
            error={invalidTitle}
            helperText={invalidTitle ? "Title is required." : undefined}
            onChange={(event) => setField("title", event.target.value)}
            sx={{ gridColumn: "1 / -1" }}
          />
          <TextField
            label="Sort title"
            value={draft.sortTitle}
            disabled={saving}
            onChange={(event) => setField("sortTitle", event.target.value)}
          />
          <TextField
            label="Original title"
            value={draft.originalTitle}
            disabled={saving}
            onChange={(event) => setField("originalTitle", event.target.value)}
          />
          <TextField
            label="Release date"
            type="date"
            value={draft.originallyAvailableAt}
            disabled={saving}
            slotProps={{ inputLabel: { shrink: true } }}
            onChange={(event) =>
              setField("originallyAvailableAt", event.target.value)
            }
          />
          <TextField
            label="Year"
            type="number"
            value={draft.year}
            disabled={saving}
            error={invalidYear}
            helperText={invalidYear ? "Enter a valid year." : undefined}
            slotProps={{ htmlInput: { min: 1800, max: new Date().getFullYear() + 10 } }}
            onChange={(event) => setField("year", event.target.value)}
          />
          <TextField
            label="Studio"
            value={draft.studio}
            disabled={saving}
            onChange={(event) => setField("studio", event.target.value)}
          />
          <TextField
            label="Content rating"
            value={draft.contentRating}
            disabled={saving}
            onChange={(event) => setField("contentRating", event.target.value)}
          />
          <TextField
            label="Tagline"
            value={draft.tagline}
            disabled={saving}
            onChange={(event) => setField("tagline", event.target.value)}
            sx={{ gridColumn: "1 / -1" }}
          />
          <TextField
            label="Summary"
            value={draft.summary}
            disabled={saving}
            multiline
            minRows={5}
            onChange={(event) => setField("summary", event.target.value)}
            sx={{ gridColumn: "1 / -1" }}
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={save}
          disabled={!dirty || invalidTitle || invalidYear || saving}
          startIcon={saving ? <CircularProgress size={16} /> : undefined}
        >
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}
