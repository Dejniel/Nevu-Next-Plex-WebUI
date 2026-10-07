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
import React, { useMemo, useState } from "react";
import { ConfirmDialog } from "shared/ui";
import type { PlexShare } from "../api/sharing";
import { useCanManageServer } from "features/session/public";
import { useAuthSession, useActiveServerScope } from "features/session/model";
import { useSharingChange, useSharingOverview } from "../model/useSharing";

import ShareEditor from "./ShareEditor";

export default function SettingsSharing() {
  const revision = useAuthSession((state) => state.revision);
  const { serverId } = useActiveServerScope();
  return <SharingSettings key={`${serverId}:${revision}`} />;
}

function SharingSettings() {
  const canManageServer = useCanManageServer();
  const overview = useSharingOverview(canManageServer);
  const removal = useSharingChange();
  const libraries = overview.data?.libraries;
  const shares = overview.data?.shares;
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingShare, setEditingShare] = useState<PlexShare | null>(null);
  const [removingShare, setRemovingShare] = useState<PlexShare | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const libraryNames = useMemo(
    () => new Map(libraries?.map((library) => [library.id, library.title])),
    [libraries],
  );
  const orderedShares = useMemo(
    () =>
      [...(shares ?? [])].sort(
        (a, b) =>
          a.status.localeCompare(b.status) ||
          a.displayName.localeCompare(b.displayName),
      ),
    [shares],
  );

  const openEditor = (share: PlexShare | null) => {
    setEditingShare(share);
    setEditorOpen(true);
  };

  const saved = (message: string) => {
    setEditorOpen(false);
    setNotice(message);
  };

  const remove = () => {
    if (!removingShare || removal.isPending) return;
    removal.mutate(
      { type: "remove", id: removingShare.id },
      {
        onSuccess: () => {
          setNotice(`Removed access for ${removingShare.displayName}.`);
          setRemovingShare(null);
        },
      },
    );
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
      <Box
        sx={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 2,
          width: "100%",
        }}
      >
        <Typography variant="h4">Sharing</Typography>
        <Button
          variant="contained"
          startIcon={<AddRounded />}
          disabled={!overview.data}
          onClick={() => openEditor(null)}
        >
          Share libraries
        </Button>
      </Box>

      {overview.error && (
        <Alert
          severity="error"
          action={
            <Button color="inherit" onClick={() => overview.refetch()}>
              Retry
            </Button>
          }
          sx={{ mt: 3, width: "100%" }}
        >
          {overview.error.message}
        </Alert>
      )}

      {overview.isPending ? (
        <CircularProgress sx={{ alignSelf: "center", mt: 6 }} size={28} />
      ) : (
        overview.data && (
          <Box sx={{ width: "100%", mt: 3 }}>
            {orderedShares.length === 0 ? (
              <Typography sx={{ color: "text.secondary" }}>
                No libraries are currently shared.
              </Typography>
            ) : (
              orderedShares.map((share) => {
                const names = share.librarySectionIds
                  .map((id) => libraryNames.get(id))
                  .filter(Boolean)
                  .join(", ");
                return (
                  <Box
                    key={share.id}
                    sx={{
                      display: "grid",
                      gridTemplateColumns: {
                        xs: "auto minmax(0, 1fr) auto",
                        sm: "auto minmax(0, 1fr) auto auto",
                      },
                      alignItems: "center",
                      columnGap: 1.5,
                      rowGap: 0.75,
                      py: 2,
                      borderBottom: "1px solid",
                      borderColor: "divider",
                    }}
                  >
                    <Avatar sx={{ width: 40, height: 40 }}>
                      <PersonRounded />
                    </Avatar>
                    <Box sx={{ minWidth: 0 }}>
                      <Box
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          gap: 1,
                          flexWrap: "wrap",
                        }}
                      >
                        <Typography noWrap sx={{ fontWeight: 600 }}>
                          {share.displayName}
                        </Typography>
                        {share.home && (
                          <Chip
                            label="Plex Home"
                            size="small"
                            variant="outlined"
                          />
                        )}
                      </Box>
                      {share.account && (
                        <Typography
                          variant="body2"
                          noWrap
                          sx={{ color: "text.secondary" }}
                        >
                          {share.account}
                        </Typography>
                      )}
                      <Typography
                        variant="body2"
                        noWrap
                        sx={{ color: "text.secondary" }}
                      >
                        {share.allLibraries
                          ? "All libraries"
                          : names || "No available libraries"}
                        {share.allowDownloads ? " · Downloads allowed" : ""}
                      </Typography>
                    </Box>
                    <Chip
                      label={
                        share.status === "active"
                          ? "Active"
                          : "Invitation pending"
                      }
                      color={share.status === "active" ? "success" : "warning"}
                      size="small"
                      sx={{ display: { xs: "none", sm: "inline-flex" } }}
                    />
                    <Box sx={{ display: "flex" }}>
                      <Tooltip title="Edit access">
                        <IconButton
                          aria-label={`Edit access for ${share.displayName}`}
                          onClick={() => openEditor(share)}
                        >
                          <EditRounded />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Remove access">
                        <IconButton
                          color="error"
                          aria-label={`Remove access for ${share.displayName}`}
                          onClick={() => {
                            removal.reset();
                            setRemovingShare(share);
                          }}
                        >
                          <DeleteOutlineRounded />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </Box>
                );
              })
            )}
          </Box>
        )
      )}

      <ShareEditor
        open={editorOpen}
        share={editingShare}
        libraries={libraries ?? []}
        onClose={() => setEditorOpen(false)}
        onSaved={saved}
      />

      <ConfirmDialog
        open={Boolean(removingShare)}
        title="Remove library access?"
        message={`${removingShare?.displayName || "This user"} will no longer have access to this Plex server.`}
        busy={removal.isPending}
        error={removal.error?.message}
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
