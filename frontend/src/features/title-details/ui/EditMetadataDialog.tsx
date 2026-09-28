import {
  Alert,
  Box,
  Button,
  CircularProgress,
  IconButton,
  InputAdornment,
  TextField,
  Tooltip,
} from "@mui/material";
import { LockOpenRounded, LockRounded } from "@mui/icons-material";
import React, { useEffect, useMemo, useState } from "react";
import {
  EDITABLE_METADATA_FIELDS,
  getMetadataLocks,
  MetadataField,
  MetadataLocks,
  MetadataLockUpdate,
  MetadataUpdate,
  updateMetadata,
} from "../api/metadata";
import AppDialog from "components/AppDialog";

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

const fieldLabels: Record<MetadataField, string> = {
  title: "Title",
  sortTitle: "Sort title",
  originalTitle: "Original title",
  originallyAvailableAt: "Release date",
  year: "Year",
  studio: "Studio",
  contentRating: "Content rating",
  tagline: "Tagline",
  summary: "Summary",
};

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
  onSaved: (
    changes: MetadataUpdate,
    lockChanges: MetadataLockUpdate,
  ) => void;
}) {
  const initial = useMemo(() => draftFromMetadata(data), [data]);
  const initialLocks = useMemo(() => getMetadataLocks(data), [data]);
  const [draft, setDraft] = useState(initial);
  const [locks, setLocks] = useState<MetadataLocks>(initialLocks);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setDraft(initial);
      setLocks(initialLocks);
      setError(null);
    }
  }, [initial, initialLocks, open]);

  const changes = changedFields(initial, draft);
  const lockChanges = Object.fromEntries(
    EDITABLE_METADATA_FIELDS.filter(
      (field) =>
        changes[field] !== undefined || locks[field] !== initialLocks[field],
    ).map((field) => [field, locks[field]]),
  ) as MetadataLockUpdate;
  const dirty =
    Object.keys(changes).length > 0 || Object.keys(lockChanges).length > 0;
  const year = draft.year ? Number(draft.year) : null;
  const invalidYear =
    year !== null &&
    (!Number.isInteger(year) || year < 1800 || year > new Date().getFullYear() + 10);
  const invalidTitle = draft.title.trim().length === 0;

  const setField = (field: keyof MetadataDraft, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }));
    setLocks((current) => ({
      ...current,
      [field]: value === initial[field] ? initialLocks[field] : true,
    }));
  };

  const lockAdornment = (field: MetadataField, alignTop = false) => {
    const locked = locks[field];
    const label = fieldLabels[field];

    return (
      <InputAdornment
        position="end"
        sx={alignTop ? { alignSelf: "flex-start", mt: 1 } : undefined}
      >
        <Tooltip
          title={
            locked
              ? "Keep this field during metadata refresh"
              : "Allow Plex to update this field"
          }
        >
          <span>
            <IconButton
              edge="end"
              size="small"
              disabled={saving}
              aria-label={`${locked ? "Unlock" : "Lock"} ${label} metadata`}
              onClick={() =>
                setLocks((current) => ({
                  ...current,
                  [field]: !current[field],
                }))
              }
              sx={
                locked
                  ? { color: "primary.main" }
                  : { color: "text.disabled" }
              }
            >
              {locked ? <LockRounded /> : <LockOpenRounded />}
            </IconButton>
          </span>
        </Tooltip>
      </InputAdornment>
    );
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
      await updateMetadata(data.ratingKey, normalized, lockChanges);
      onSaved(normalized, lockChanges);
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
    <AppDialog
      open={open}
      title="Edit metadata"
      onClose={onClose}
      busy={saving}
      actions={
        <Button
          variant="contained"
          onClick={save}
          disabled={!dirty || invalidTitle || invalidYear || saving}
          startIcon={saving ? <CircularProgress size={16} /> : undefined}
        >
          Save
        </Button>
      }
    >
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
          slotProps={{ input: { endAdornment: lockAdornment("title") } }}
          sx={{ gridColumn: "1 / -1" }}
        />
        <TextField
          label="Sort title"
          value={draft.sortTitle}
          disabled={saving}
          onChange={(event) => setField("sortTitle", event.target.value)}
          slotProps={{ input: { endAdornment: lockAdornment("sortTitle") } }}
        />
        <TextField
          label="Original title"
          value={draft.originalTitle}
          disabled={saving}
          onChange={(event) => setField("originalTitle", event.target.value)}
          slotProps={{
            input: { endAdornment: lockAdornment("originalTitle") },
          }}
        />
        <TextField
          label="Release date"
          type="date"
          value={draft.originallyAvailableAt}
          disabled={saving}
          slotProps={{
            input: { endAdornment: lockAdornment("originallyAvailableAt") },
            inputLabel: { shrink: true },
          }}
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
          slotProps={{
            input: { endAdornment: lockAdornment("year") },
            htmlInput: { min: 1800, max: new Date().getFullYear() + 10 },
          }}
          onChange={(event) => setField("year", event.target.value)}
        />
        <TextField
          label="Studio"
          value={draft.studio}
          disabled={saving}
          onChange={(event) => setField("studio", event.target.value)}
          slotProps={{ input: { endAdornment: lockAdornment("studio") } }}
        />
        <TextField
          label="Content rating"
          value={draft.contentRating}
          disabled={saving}
          onChange={(event) => setField("contentRating", event.target.value)}
          slotProps={{
            input: { endAdornment: lockAdornment("contentRating") },
          }}
        />
        <TextField
          label="Tagline"
          value={draft.tagline}
          disabled={saving}
          onChange={(event) => setField("tagline", event.target.value)}
          slotProps={{ input: { endAdornment: lockAdornment("tagline") } }}
          sx={{ gridColumn: "1 / -1" }}
        />
        <TextField
          label="Summary"
          value={draft.summary}
          disabled={saving}
          multiline
          minRows={5}
          onChange={(event) => setField("summary", event.target.value)}
          slotProps={{
            input: { endAdornment: lockAdornment("summary", true) },
          }}
          sx={{ gridColumn: "1 / -1" }}
        />
      </Box>
    </AppDialog>
  );
}
