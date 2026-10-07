import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  FormControlLabel,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import React, { useEffect, useRef, useState } from "react";
import { AppDialog } from "shared/ui";
import { useAuthSession } from "features/session/model";
import { createShare, deleteShare, updateShare } from "../api/sharing";
import type { PlexShare, SharingLibrary } from "../api/sharing";

interface ShareEditorProps {
  open: boolean;
  share: PlexShare | null;
  libraries: SharingLibrary[];
  recipient?: { id: number; title: string };
  onClose: () => void;
  onSaved: (message: string) => void;
  onSettled?: () => Promise<unknown>;
}

export default function ShareEditor({
  open,
  share,
  libraries,
  recipient,
  onClose,
  onSaved,
  onSettled,
}: ShareEditorProps) {
  const [account, setAccount] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [allowDownloads, setAllowDownloads] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const revision = useAuthSession((state) => state.revision);
  useEffect(() => () => controller.current?.abort(), [revision]);

  useEffect(() => {
    if (!open) return;
    setAccount("");
    setSelected(
      share?.allLibraries
        ? libraries.map((library) => library.id)
        : share?.librarySectionIds ||
            (recipient ? [] : libraries.map((library) => library.id)),
    );
    setAllowDownloads(share?.allowDownloads ?? true);
    setError(null);
  }, [libraries, open, share, recipient]);

  const allSelected =
    libraries.length > 0 && selected.length === libraries.length;
  const toggleLibrary = (id: string) => {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((libraryId) => libraryId !== id)
        : [...current, id],
    );
  };

  const save = async () => {
    if (
      controller.current ||
      (selected.length === 0 && (!recipient || !share)) ||
      (!share && !recipient && !account.trim())
    )
      return;
    const operation = new AbortController();
    controller.current = operation;
    setSaving(true);
    setError(null);
    try {
      const input = { librarySectionIds: selected, allowDownloads };
      if (share && selected.length === 0) {
        await deleteShare(share.id, operation.signal);
      } else if (share) {
        await updateShare(share.id, input, operation.signal);
      } else {
        await createShare(
          {
            ...input,
            ...(recipient
              ? { invitedId: recipient.id }
              : { invitedAccount: account.trim() }),
          },
          operation.signal,
        );
      }
      if (
        !operation.signal.aborted &&
        useAuthSession.getState().revision === revision
      )
        onSaved(
          recipient || share
            ? `Updated access for ${recipient?.title || share?.displayName}.`
            : "Plex invitation sent.",
        );
    } catch (error) {
      if (
        !operation.signal.aborted &&
        useAuthSession.getState().revision === revision
      )
        setError(
          error instanceof Error ? error.message : "Sharing update failed.",
        );
    } finally {
      if (useAuthSession.getState().revision === revision) await onSettled?.();
      controller.current = null;
      if (
        !operation.signal.aborted &&
        useAuthSession.getState().revision === revision
      )
        setSaving(false);
    }
  };

  return (
    <AppDialog
      open={open}
      title={
        recipient
          ? `Libraries for ${recipient.title}`
          : share
            ? `Edit ${share.displayName}`
            : "Share libraries"
      }
      onClose={onClose}
      busy={saving}
      actions={
        <Button
          variant="contained"
          onClick={save}
          disabled={
            saving ||
            (selected.length === 0 && (!recipient || !share)) ||
            (!share && !recipient && !account.trim())
          }
          startIcon={saving ? <CircularProgress size={16} /> : undefined}
        >
          {share || recipient ? "Save" : "Send invitation"}
        </Button>
      }
    >
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      {!share && !recipient && (
        <TextField
          autoFocus
          fullWidth
          required
          label="Plex email or username"
          value={account}
          disabled={saving}
          autoComplete="off"
          onChange={(event) => setAccount(event.target.value)}
          sx={{ mt: 1, mb: 2 }}
        />
      )}

      <Typography variant="subtitle2" sx={{ color: "text.secondary", mb: 0.5 }}>
        Libraries
      </Typography>
      <FormControlLabel
        control={
          <Checkbox
            checked={allSelected}
            indeterminate={selected.length > 0 && !allSelected}
            disabled={saving}
            onChange={() =>
              setSelected(
                allSelected ? [] : libraries.map((library) => library.id),
              )
            }
          />
        }
        label="All libraries"
      />
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
        }}
      >
        {libraries.map((library) => (
          <FormControlLabel
            key={library.id}
            control={
              <Checkbox
                checked={selected.includes(library.id)}
                disabled={saving}
                onChange={() => toggleLibrary(library.id)}
              />
            }
            label={library.title}
          />
        ))}
      </Box>

      {selected.length === 0 && (
        <Typography variant="caption" color="error">
          {recipient && share
            ? "Saving will remove access to this server."
            : "Select at least one library."}
        </Typography>
      )}

      <Box
        sx={{ mt: 2, pt: 1, borderTop: "1px solid", borderColor: "divider" }}
      >
        <FormControlLabel
          control={
            <Switch
              checked={allowDownloads}
              disabled={saving}
              onChange={(_, checked) => setAllowDownloads(checked)}
            />
          }
          label="Allow downloads"
        />
      </Box>
    </AppDialog>
  );
}
