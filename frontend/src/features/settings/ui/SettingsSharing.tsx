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
  Chip,
  CircularProgress,
  IconButton,
  Snackbar,
  Tooltip,
  Typography,
} from "@mui/material";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ConfirmDialog } from "shared/ui";
import {
  deleteShare,
  getSharingOverview,
  PlexShare,
  SharingLibrary,
} from "../api/sharing";
import { useCanManageServer } from "features/session/public";

import ShareEditor from "./ShareEditor";

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
            <Typography sx={{ color: "text.secondary" }}>No libraries are currently shared.</Typography>
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
                    <Typography noWrap sx={{ fontWeight: 600 }}>{share.displayName}</Typography>
                    {share.home && <Chip label="Plex Home" size="small" variant="outlined" />}
                  </Box>
                  {share.account && (
                    <Typography variant="body2" noWrap sx={{ color: "text.secondary" }}>
                      {share.account}
                    </Typography>
                  )}
                  <Typography variant="body2" noWrap sx={{ color: "text.secondary" }}>
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

      <ConfirmDialog
        open={Boolean(removingShare)}
        title="Remove library access?"
        message={`${removingShare?.displayName || "This user"} will no longer have access to this Plex server.`}
        busy={removing}
        onClose={() => setRemovingShare(null)}
        onConfirm={remove}
        confirmLabel="Remove"
        busyLabel="Removing..."
        confirmColor="error"
      />

      <Snackbar
        open={Boolean(notice)}
        autoHideDuration={4000}
        onClose={() => setNotice(null)}
        message={notice}
      />
    </>
  );
}
