import {
  AddRounded,
  DeleteOutlineRounded,
  EditRounded,
  PersonRounded,
} from "@mui/icons-material";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControlLabel,
  IconButton,
  Snackbar,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  createShare,
  deleteShare,
  getSharingOverview,
  PlexShare,
  SharingLibrary,
  updateShare,
} from "../../plex/sharing";
import { useCanManageServer } from "../../states/ServerAccess";

interface ShareEditorProps {
  open: boolean;
  share: PlexShare | null;
  libraries: SharingLibrary[];
  onClose: () => void;
  onSaved: (message: string) => void;
}

function ShareEditor({ open, share, libraries, onClose, onSaved }: ShareEditorProps) {
  const [account, setAccount] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [allowDownloads, setAllowDownloads] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setAccount("");
    setSelected(share?.librarySectionIds || libraries.map((library) => library.id));
    setAllowDownloads(share?.allowDownloads ?? true);
    setError(null);
  }, [libraries, open, share]);

  const allSelected = libraries.length > 0 && selected.length === libraries.length;
  const toggleLibrary = (id: string) => {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((libraryId) => libraryId !== id)
        : [...current, id],
    );
  };

  const save = async () => {
    if (selected.length === 0 || (!share && !account.trim())) return;
    setSaving(true);
    setError(null);
    try {
      const input = { librarySectionIds: selected, allowDownloads };
      if (share) {
        await updateShare(share.id, input);
        onSaved(`Updated access for ${share.displayName}.`);
      } else {
        await createShare({ ...input, invitedAccount: account.trim() });
        onSaved("Plex invitation sent.");
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : "Sharing update failed.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={() => !saving && onClose()} fullWidth maxWidth="sm">
      <DialogTitle>{share ? `Edit ${share.displayName}` : "Share libraries"}</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {!share && (
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
                setSelected(allSelected ? [] : libraries.map((library) => library.id))
              }
            />
          }
          label="All libraries"
        />
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}>
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
            Select at least one library.
          </Typography>
        )}

        <Box sx={{ mt: 2, pt: 1, borderTop: "1px solid", borderColor: "divider" }}>
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
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>Cancel</Button>
        <Button
          variant="contained"
          onClick={save}
          disabled={saving || selected.length === 0 || (!share && !account.trim())}
          startIcon={saving ? <CircularProgress size={16} /> : undefined}
        >
          {share ? "Save" : "Send invitation"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default function SettingsSharing() {
  const canManageServer = useCanManageServer();
  const [libraries, setLibraries] = useState<SharingLibrary[]>([]);
  const [shares, setShares] = useState<PlexShare[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingShare, setEditingShare] = useState<PlexShare | null>(null);
  const [removingShare, setRemovingShare] = useState<PlexShare | null>(null);
  const [removing, setRemoving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!canManageServer) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const overview = await getSharingOverview();
      setLibraries(overview.libraries);
      setShares(overview.shares);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not load Plex sharing.");
    } finally {
      setLoading(false);
    }
  }, [canManageServer]);

  useEffect(() => {
    load();
  }, [load]);

  const libraryNames = useMemo(
    () => new Map(libraries.map((library) => [library.id, library.title])),
    [libraries],
  );
  const orderedShares = useMemo(
    () => [...shares].sort((a, b) =>
      a.status.localeCompare(b.status) || a.displayName.localeCompare(b.displayName)),
    [shares],
  );

  const openEditor = (share: PlexShare | null) => {
    setEditingShare(share);
    setEditorOpen(true);
  };

  const saved = (message: string) => {
    setEditorOpen(false);
    setNotice(message);
    load();
  };

  const remove = async () => {
    if (!removingShare) return;
    setRemoving(true);
    try {
      await deleteShare(removingShare.id);
      setNotice(`Removed access for ${removingShare.displayName}.`);
      setRemovingShare(null);
      await load();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not remove this share.");
    } finally {
      setRemoving(false);
    }
  };

  if (!canManageServer) {
    return (
      <>
        <Typography variant="h4">Sharing</Typography>
        <Alert severity="info" sx={{ mt: 3 }}>
          The active Plex profile cannot manage sharing on this server.
        </Alert>
      </>
    );
  }

  return (
    <>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2, width: "100%" }}>
        <Typography variant="h4">Sharing</Typography>
        <Button variant="contained" startIcon={<AddRounded />} onClick={() => openEditor(null)}>
          Share libraries
        </Button>
      </Box>

      {error && (
        <Alert severity="error" action={<Button color="inherit" onClick={load}>Retry</Button>} sx={{ mt: 3, width: "100%" }}>
          {error}
        </Alert>
      )}

      {loading ? (
        <CircularProgress sx={{ alignSelf: "center", mt: 6 }} size={28} />
      ) : (
        <Box sx={{ width: "100%", mt: 3 }}>
          {orderedShares.length === 0 ? (
            <Typography color="text.secondary">No libraries are currently shared.</Typography>
          ) : orderedShares.map((share) => {
            const names = share.librarySectionIds
              .map((id) => libraryNames.get(id))
              .filter(Boolean)
              .join(", ");
            return (
              <Box
                key={share.id}
                sx={{
                  display: "grid",
                  gridTemplateColumns: { xs: "auto 1fr auto", sm: "auto minmax(0, 1fr) auto auto" },
                  alignItems: "center",
                  columnGap: 1.5,
                  rowGap: 0.75,
                  py: 2,
                  borderBottom: "1px solid",
                  borderColor: "divider",
                }}
              >
                <Avatar sx={{ width: 40, height: 40 }}><PersonRounded /></Avatar>
                <Box sx={{ minWidth: 0 }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                    <Typography fontWeight={600} noWrap>{share.displayName}</Typography>
                    {share.home && <Chip label="Plex Home" size="small" variant="outlined" />}
                  </Box>
                  {share.account && (
                    <Typography variant="body2" color="text.secondary" noWrap>
                      {share.account}
                    </Typography>
                  )}
                  <Typography variant="body2" color="text.secondary" noWrap>
                    {share.allLibraries ? "All libraries" : names || "No available libraries"}
                    {share.allowDownloads ? " · Downloads allowed" : ""}
                  </Typography>
                </Box>
                <Chip
                  label={share.status === "active" ? "Active" : "Invitation pending"}
                  color={share.status === "active" ? "success" : "warning"}
                  size="small"
                  sx={{ display: { xs: "none", sm: "inline-flex" } }}
                />
                <Box sx={{ display: "flex" }}>
                  <Tooltip title="Edit access">
                    <IconButton aria-label={`Edit access for ${share.displayName}`} onClick={() => openEditor(share)}>
                      <EditRounded />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Remove access">
                    <IconButton color="error" aria-label={`Remove access for ${share.displayName}`} onClick={() => setRemovingShare(share)}>
                      <DeleteOutlineRounded />
                    </IconButton>
                  </Tooltip>
                </Box>
              </Box>
            );
          })}
        </Box>
      )}

      <ShareEditor
        open={editorOpen}
        share={editingShare}
        libraries={libraries}
        onClose={() => setEditorOpen(false)}
        onSaved={saved}
      />

      <Dialog open={Boolean(removingShare)} onClose={() => !removing && setRemovingShare(null)}>
        <DialogTitle>Remove library access?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {removingShare?.displayName} will no longer have access to this Plex server.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRemovingShare(null)} disabled={removing}>Cancel</Button>
          <Button color="error" variant="contained" onClick={remove} disabled={removing} startIcon={removing ? <CircularProgress size={16} /> : undefined}>
            Remove
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={Boolean(notice)}
        autoHideDuration={4000}
        onClose={() => setNotice(null)}
        message={notice}
      />
    </>
  );
}
