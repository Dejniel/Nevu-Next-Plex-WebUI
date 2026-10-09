import {
  CollectionsBookmarkRounded,
  PlaylistPlayRounded,
  PhotoAlbumRounded,
} from "@mui/icons-material";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  CircularProgress,
  Portal,
  Snackbar,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AppDialog } from "shared/ui";
import { overlayContainer } from "shared/lib/overlayContainer";
import { useUserSettings } from "features/settings/model";
import { getMediaListChoices, saveMediaListItem } from "../api/mediaLists";
import {
  mediaListPath,
  type MediaListKind,
  type MediaListSummary,
} from "../model/mediaLists";
import type { MediaListItem } from "../model/mediaListEditing";
import { useMediaListDialog } from "../model/mediaListDialog";

export default function MediaListActionDialog() {
  const selection = useMediaListDialog((state) => state.selection);
  const profileKey = useUserSettings((state) => state.profileKey);
  const noticeID = useRef(0);
  const [saved, setSaved] = useState<{
    list: MediaListSummary;
    libraryID?: string;
    noticeID: number;
  } | null>(null);
  const onClose = () => useMediaListDialog.setState({ selection: null });
  useEffect(() => {
    setSaved(null);
    useMediaListDialog.setState({ selection: null });
  }, [profileKey]);
  return (
    <>
      {selection && selection.profileKey === profileKey && (
        <AddToMediaListForm
          key={`${profileKey}:${selection.item.ratingKey}:${selection.kind}`}
          item={selection.item}
          kind={selection.kind}
          onClose={onClose}
          onSaved={(list) => {
            setSaved({
              list,
              noticeID: ++noticeID.current,
              libraryID: selection.item.librarySectionID
                ? String(selection.item.librarySectionID)
                : undefined,
            });
            onClose();
          }}
        />
      )}
      <Portal container={overlayContainer}>
        <Snackbar
          key={saved?.noticeID}
          open={Boolean(saved)}
          autoHideDuration={6000}
          onClose={() => setSaved(null)}
          message={saved ? `Added to “${saved.list.title}”.` : ""}
          action={
            saved && (
              <Button
                component={Link}
                to={mediaListPath(saved.list, saved.libraryID)}
                color="inherit"
                onClick={() => setSaved(null)}
              >
                Open
              </Button>
            )
          }
        />
      </Portal>
    </>
  );
}

function AddToMediaListForm({
  item,
  kind,
  onClose,
  onSaved,
}: {
  item: MediaListItem;
  kind: MediaListKind;
  onClose: () => void;
  onSaved: (list: MediaListSummary) => void;
}) {
  const noun = kind === "playlist" && item.type === "photo" ? "album" : kind;
  const name = noun[0].toUpperCase() + noun.slice(1);
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [lists, setLists] = useState<MediaListSummary[]>([]);
  const [selected, setSelected] = useState<MediaListSummary | null>(null);
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError(null);
    void getMediaListChoices(kind, item, controller.signal)
      .then((choices) => {
        if (controller.signal.aborted) return;
        setLists(choices);
        if (!choices.some((list) => !list.smart)) setMode("new");
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setLoadError(`Plex could not load your ${noun}s.`);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [kind, item, revision, noun]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (
      busy ||
      (mode === "existing" ? !selected || selected.smart : !title.trim())
    )
      return;
    setBusy(true);
    setSaveError(null);
    try {
      const result = await saveMediaListItem(
        kind,
        item,
        mode === "existing" && selected ? { id: selected.id } : { title },
      );
      if (alive.current) onSaved(result);
    } catch (error) {
      if (alive.current)
        setSaveError(
          error instanceof Error
            ? error.message
            : `Plex could not add this item to the ${kind}.`,
        );
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  return (
    <AppDialog
      open
      title={`Add to ${noun}`}
      size="compact"
      busy={busy}
      onClose={onClose}
      actions={
        <>
          <Button disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="contained"
            disabled={
              busy ||
              (mode === "existing"
                ? !selected || selected.smart || Boolean(loadError)
                : !title.trim())
            }
            onClick={submit}
            startIcon={
              busy ? <CircularProgress size={16} color="inherit" /> : undefined
            }
          >
            {mode === "new" ? "Create and add" : "Add"}
          </Button>
        </>
      }
    >
      <Stack component="form" onSubmit={submit} spacing={2}>
        <Typography variant="body2" sx={{ overflowWrap: "anywhere" }}>
          {item.title}
        </Typography>
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          {kind === "playlist"
            ? `Add to the end of ${noun === "album" ? "an album" : "a playlist"} for your current profile.`
            : "Collections organize titles in this library for everyone with access."}
        </Typography>
        <Tabs
          value={mode}
          onChange={(_, value) => {
            setMode(value);
            setSaveError(null);
          }}
          variant="fullWidth"
        >
          <Tab value="existing" label="Existing" disabled={busy} />
          <Tab value="new" label="New" disabled={busy} />
        </Tabs>
        {loadError && mode === "existing" && (
          <Alert
            severity="error"
            action={
              <Button
                color="inherit"
                disabled={loading}
                onClick={() => setRevision((value) => value + 1)}
              >
                Retry
              </Button>
            }
          >
            {loadError}
          </Alert>
        )}
        {mode === "new" ? (
          <TextField
            autoFocus
            fullWidth
            label={`${name} name`}
            value={title}
            disabled={busy}
            onChange={(event) => setTitle(event.target.value)}
          />
        ) : (
          <Autocomplete
            options={lists}
            value={selected}
            onChange={(_, value) => {
              setSelected(value);
              setSaveError(null);
            }}
            disabled={busy || Boolean(loadError)}
            loading={loading}
            getOptionLabel={(option) => option.title}
            getOptionDisabled={(option) => option.smart}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            noOptionsText={
              loading ? "Loading…" : `No ${noun}s yet. Create a new one.`
            }
            renderInput={(params) => (
              <TextField
                {...params}
                label={`Choose ${noun}`}
                helperText={
                  selected?.smart
                    ? "Smart lists add items automatically."
                    : "Search by name or create a new list."
                }
              />
            )}
            renderOption={(props, option) => (
              <Box component="li" {...props} key={option.id} sx={{ gap: 1.5 }}>
                {noun === "album" ? (
                  <PhotoAlbumRounded color="action" />
                ) : kind === "playlist" ? (
                  <PlaylistPlayRounded color="action" />
                ) : (
                  <CollectionsBookmarkRounded color="action" />
                )}
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ overflowWrap: "anywhere" }}>
                    {option.title}
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{ color: "text.secondary" }}
                  >
                    {option.smart
                      ? "Smart · managed by filters"
                      : `${option.count} items`}
                  </Typography>
                </Box>
              </Box>
            )}
          />
        )}
        {saveError && <Alert severity="error">{saveError}</Alert>}
      </Stack>
    </AppDialog>
  );
}
