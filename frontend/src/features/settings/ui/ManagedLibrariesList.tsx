import {
  EditRounded,
  LibraryMusicRounded,
  LocalMoviesRounded,
  MoreVertRounded,
  PhotoLibraryRounded,
  TvRounded,
  VideoLibraryRounded,
} from "@mui/icons-material";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Divider,
  IconButton,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Tooltip,
} from "@mui/material";
import { useState } from "react";
import { Link } from "react-router-dom";
import { ConfirmDialog } from "shared/ui";
import {
  useLibraryChange,
  useManagedLibraries,
} from "../model/useLibraryAdministration";

const menuDotsSx = {
  color: "text.secondary",
  opacity: 0.58,
  transition: "none",
  "&:hover": {
    color: "text.primary",
    opacity: 0.82,
    backgroundColor: "transparent",
    transform: "none",
  },
};

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Plex library request failed.";
}

function libraryIcon(type: string) {
  switch (type) {
    case "movie":
      return <LocalMoviesRounded />;
    case "show":
      return <TvRounded />;
    case "artist":
      return <LibraryMusicRounded />;
    case "photo":
      return <PhotoLibraryRounded />;
    default:
      return <VideoLibraryRounded />;
  }
}

export default function ManagedLibrariesList({
  deleting,
  onCloseDelete,
  onRemoved,
  onNotice,
}: {
  deleting: string | null;
  onCloseDelete: () => void;
  onRemoved: (message: string) => void;
  onNotice: (message: string) => void;
}) {
  const query = useManagedLibraries();
  const libraries = query.data ?? [];
  const change = useLibraryChange();
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [menuLibraryId, setMenuLibraryId] = useState<string | null>(null);
  const menuLibrary = libraries.find((library) => library.id === menuLibraryId);
  const [confirmAction, setConfirmAction] = useState<
    "refresh-metadata" | "empty-trash" | null
  >(null);
  const deleteTarget =
    libraries.find((library) => library.id === deleting) || null;

  const performAction = async (
    action: "scan" | "refresh-metadata" | "analyze" | "empty-trash",
  ) => {
    if (!menuLibrary) return;
    try {
      await change.mutateAsync({ type: "action", id: menuLibrary.id, action });
      onNotice(
        action === "scan" ? "Library scan started." : "Library action started.",
      );
      setMenuAnchor(null);
      return true;
    } catch (reason) {
      if (!confirmAction) onNotice(errorMessage(reason));
      return false;
    }
  };

  return (
    <Box sx={{ width: "100%" }}>
      {query.error && (
        <Alert
          severity="error"
          sx={{ mt: 2 }}
          action={<Button onClick={() => query.refetch()}>Retry</Button>}
        >
          {query.error.message}
        </Alert>
      )}
      {query.isPending ? (
        <Box sx={{ py: 8, display: "flex", justifyContent: "center" }}>
          <CircularProgress />
        </Box>
      ) : (
        <List disablePadding>
          {libraries.map((library) => (
            <ListItem
              key={library.id}
              divider
              secondaryAction={
                <Box sx={{ display: "flex", alignItems: "center" }}>
                  <Tooltip title="Edit library">
                    <IconButton
                      aria-label={`Edit library ${library.title}`}
                      disabled={change.isPending}
                      component={Link}
                      to={`/settings/manage-libraries?edit=${library.id}`}
                    >
                      <EditRounded />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Library actions">
                    <IconButton
                      aria-label={`Actions for library ${library.title}`}
                      disabled={change.isPending}
                      sx={menuDotsSx}
                      onClick={(event) => {
                        change.reset();
                        setMenuLibraryId(library.id);
                        setMenuAnchor(event.currentTarget);
                      }}
                    >
                      <MoreVertRounded />
                    </IconButton>
                  </Tooltip>
                </Box>
              }
              sx={{ minHeight: 72, pr: 12 }}
            >
              <ListItemIcon>{libraryIcon(library.type)}</ListItemIcon>
              <ListItemText
                primary={library.title}
                secondary={`${library.locations.join(", ") || "No folders"}${library.refreshing ? " · Scanning" : ""}`}
                slotProps={{ secondary: { noWrap: true } }}
              />
            </ListItem>
          ))}
          {!libraries.length && !query.error && (
            <ListItem>
              <ListItemText primary="No Plex libraries found." />
            </ListItem>
          )}
        </List>
      )}

      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={() => setMenuAnchor(null)}
      >
        <MenuItem
          disabled={change.isPending}
          component={Link}
          to={`/settings/manage-libraries?edit=${menuLibrary?.id || ""}`}
          onClick={() => setMenuAnchor(null)}
        >
          <ListItemText>Edit</ListItemText>
        </MenuItem>
        <Divider />
        <MenuItem
          disabled={change.isPending}
          onClick={() => performAction("scan")}
        >
          <ListItemText>Scan library files</ListItemText>
        </MenuItem>
        <MenuItem
          disabled={change.isPending}
          onClick={() => {
            setConfirmAction("refresh-metadata");
            setMenuAnchor(null);
          }}
        >
          <ListItemText>Refresh all metadata</ListItemText>
        </MenuItem>
        <MenuItem
          disabled={change.isPending}
          onClick={() => performAction("analyze")}
        >
          <ListItemText>Analyze</ListItemText>
        </MenuItem>
        <MenuItem
          disabled={change.isPending}
          onClick={() => {
            setConfirmAction("empty-trash");
            setMenuAnchor(null);
          }}
        >
          <ListItemText>Empty trash</ListItemText>
        </MenuItem>
        <Divider />
        <MenuItem
          disabled={change.isPending}
          component={Link}
          to={`/settings/manage-libraries?delete=${menuLibrary?.id || ""}`}
          sx={{ color: "error.main" }}
          onClick={() => setMenuAnchor(null)}
        >
          <ListItemText>Delete library</ListItemText>
        </MenuItem>
      </Menu>

      <ConfirmDialog
        open={Boolean(deleting)}
        title={`Delete ${deleteTarget?.title || "library"}?`}
        message="This removes the library from Plex but does not delete its media files."
        busy={change.isPending}
        error={
          change.variables?.type === "remove" &&
          change.variables.id === deleting
            ? change.error?.message
            : null
        }
        onClose={onCloseDelete}
        onConfirm={async () => {
          if (!deleteTarget) return;
          try {
            await change.mutateAsync({
              type: "remove",
              id: deleteTarget.id,
              title: deleteTarget.title,
            });
            onRemoved("Library deleted.");
          } catch {
            // The mutation keeps the failure visible in the confirmation.
          }
        }}
        confirmLabel="Delete"
        busyLabel="Deleting..."
        confirmColor="error"
        confirmDisabled={!deleteTarget}
      />
      <ConfirmDialog
        open={confirmAction !== null}
        title={
          confirmAction === "empty-trash"
            ? "Empty library trash?"
            : "Refresh all metadata?"
        }
        message={
          confirmAction === "empty-trash"
            ? "Plex will permanently remove unavailable items from this library."
            : "Plex will refresh metadata for every item in this library."
        }
        busy={change.isPending}
        error={
          change.variables?.type === "action" &&
          change.variables.id === menuLibraryId &&
          change.variables.action === confirmAction
            ? change.error?.message
            : null
        }
        onClose={() => setConfirmAction(null)}
        onConfirm={async () => {
          if (!confirmAction) return;
          if (await performAction(confirmAction)) setConfirmAction(null);
        }}
        confirmDisabled={!menuLibrary}
        confirmLabel="Continue"
        busyLabel="Working..."
        confirmColor={confirmAction === "empty-trash" ? "error" : "primary"}
      />
    </Box>
  );
}
