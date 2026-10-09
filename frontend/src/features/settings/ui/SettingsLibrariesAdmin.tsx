import {
  AddRounded,
  ArrowBackRounded,
  DeleteOutlineRounded,
  EditRounded,
  FolderRounded,
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
  FormControl,
  IconButton,
  InputLabel,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Select,
  Snackbar,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { useEffect, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { AppDialog, ConfirmDialog } from "shared/ui";
import type {
  LibraryInput,
  LibraryUpdateInput,
  ManagedLibraryType,
} from "entities/library/model";
import { useCanManageServer } from "features/session/public";
import { useActiveServerScope, useAuthSession } from "features/session/model";
import {
  usePreferenceDraft,
  validatePreferenceChanges,
} from "entities/plex-preferences/model";
import { PreferenceField } from "entities/plex-preferences/public";
import {
  useLibraryChange,
  useLibraryFolders,
  useManagedLibraries,
  useManagedLibrary,
} from "../model/useLibraryAdministration";

const ROOT_BROWSE_KEY = "/services/browse/Lw==";
const LIBRARY_TYPES: Array<{ value: ManagedLibraryType; label: string }> = [
  { value: "movie", label: "Movies" },
  { value: "show", label: "TV shows" },
  { value: "artist", label: "Music" },
  { value: "photo", label: "Photos" },
  { value: "video", label: "Other videos" },
];
const LIBRARY_LANGUAGES = [
  ["ar-SA", "Arabic"],
  ["bg-BG", "Bulgarian"],
  ["ca-ES", "Catalan"],
  ["zh-CN", "Chinese (Simplified)"],
  ["zh-TW", "Chinese (Traditional)"],
  ["cs-CZ", "Czech"],
  ["da-DK", "Danish"],
  ["nl-NL", "Dutch"],
  ["en-US", "English"],
  ["fi-FI", "Finnish"],
  ["fr-FR", "French"],
  ["de-DE", "German"],
  ["el-GR", "Greek"],
  ["he-IL", "Hebrew"],
  ["hu-HU", "Hungarian"],
  ["id-ID", "Indonesian"],
  ["it-IT", "Italian"],
  ["ja-JP", "Japanese"],
  ["ko-KR", "Korean"],
  ["no-NO", "Norwegian"],
  ["fa-IR", "Persian"],
  ["pl-PL", "Polish"],
  ["pt-BR", "Portuguese (Brazil)"],
  ["pt-PT", "Portuguese (Portugal)"],
  ["ro-RO", "Romanian"],
  ["ru-RU", "Russian"],
  ["sk-SK", "Slovak"],
  ["es-ES", "Spanish"],
  ["sv-SE", "Swedish"],
  ["th-TH", "Thai"],
  ["tr-TR", "Turkish"],
  ["uk-UA", "Ukrainian"],
  ["vi-VN", "Vietnamese"],
] as const;

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

function FolderBrowser({
  open,
  onClose,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (path: string) => void;
}) {
  const [history, setHistory] = useState<Array<{ key: string; path: string }>>([
    { key: ROOT_BROWSE_KEY, path: "/" },
  ]);
  const current = history[history.length - 1];
  const query = useLibraryFolders(current.key, open);
  const folders = (query.data ?? []).filter(
    (folder) => folder.path !== current.path,
  );

  useEffect(() => {
    if (open) setHistory([{ key: ROOT_BROWSE_KEY, path: "/" }]);
  }, [open]);

  return (
    <AppDialog
      open={open}
      title="Select folder"
      onClose={onClose}
      contentSx={{ px: 0 }}
    >
      <Box sx={{ px: 2, pb: 1, display: "flex", alignItems: "center", gap: 1 }}>
        <Tooltip title="Parent folder">
          <span>
            <IconButton
              disabled={history.length === 1}
              onClick={() => setHistory((items) => items.slice(0, -1))}
            >
              <ArrowBackRounded />
            </IconButton>
          </span>
        </Tooltip>
        <Typography noWrap sx={{ fontFamily: "monospace", flex: 1 }}>
          {current.path}
        </Typography>
        <Button
          variant="contained"
          disabled={current.path === "/"}
          onClick={() => onSelect(current.path)}
        >
          Select
        </Button>
      </Box>
      <Divider />
      {query.error && (
        <Alert
          severity="error"
          sx={{ m: 2 }}
          action={<Button onClick={() => query.refetch()}>Retry</Button>}
        >
          {query.error.message}
        </Alert>
      )}
      {query.isPending ? (
        <Box sx={{ py: 6, display: "flex", justifyContent: "center" }}>
          <CircularProgress />
        </Box>
      ) : (
        <List disablePadding sx={{ maxHeight: "50vh", overflowY: "auto" }}>
          {folders.map((folder) => (
            <ListItemButton
              key={folder.key}
              onClick={() =>
                setHistory((items) => [
                  ...items,
                  { key: folder.key, path: folder.path },
                ])
              }
            >
              <ListItemIcon>
                <FolderRounded />
              </ListItemIcon>
              <ListItemText primary={folder.title} secondary={folder.path} />
            </ListItemButton>
          ))}
          {!folders.length && !query.error && (
            <ListItem>
              <ListItemText primary="No folders found." />
            </ListItem>
          )}
        </List>
      )}
    </AppDialog>
  );
}

function LibraryEditor({
  open,
  libraryId,
  onClose,
  onSaved,
}: {
  open: boolean;
  libraryId: string | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const query = useManagedLibrary(libraryId);
  const details = query.data;
  const [general, setGeneral] = useState<Partial<LibraryInput>>({});
  const type = general.type ?? "movie";
  const name = general.name ?? details?.library.title ?? "";
  const language = general.language ?? details?.library.language ?? "en-US";
  const locations = general.locations ?? details?.library.locations ?? [];
  const preferences = usePreferenceDraft(details?.preferences ?? []);
  const [tab, setTab] = useState(0);
  const [folderOpen, setFolderOpen] = useState(false);
  const [error, setError] = useState("");
  const change = useLibraryChange();
  const loading = Boolean(libraryId && query.isPending);
  const saving = change.isPending;
  const generalChanges: LibraryUpdateInput = {
    ...(name.trim() !== details?.library.title && { name: name.trim() }),
    ...(language !== details?.library.language && { language }),
    ...(JSON.stringify(locations) !==
      JSON.stringify(details?.library.locations) && { locations }),
  };
  const dirty =
    Object.keys(generalChanges).length > 0 ||
    Object.keys(preferences.changes).length > 0;

  const save = async () => {
    if (!name.trim() || !locations.length) {
      setError("Enter a library name and select at least one folder.");
      return;
    }
    setError("");
    try {
      if (libraryId) {
        await change.mutateAsync({
          type: "update",
          id: libraryId,
          input: {
            ...generalChanges,
            preferences: validatePreferenceChanges(
              details?.preferences ?? [],
              preferences.draft,
            ),
          },
        });
      } else {
        await change.mutateAsync({
          type: "create",
          input: { name: name.trim(), language, locations, type },
        });
      }
      onSaved(libraryId ? "Library updated." : "Library created.");
    } catch (reason) {
      setError(errorMessage(reason));
    }
  };

  const visiblePreferences = details?.preferences ?? [];
  return (
    <>
      <AppDialog
        open={open}
        title={
          libraryId
            ? `Edit ${details?.library.title || "library"}`
            : "Add library"
        }
        onClose={onClose}
        busy={saving}
        headerContent={
          <>
            <Tabs
              value={tab}
              onChange={(_, value) => setTab(value)}
              sx={{ px: 3 }}
            >
              <Tab label="General" disabled={saving} />
              <Tab label="Folders" disabled={saving} />
              {libraryId && <Tab label="Advanced" disabled={saving} />}
            </Tabs>
            <Divider />
          </>
        }
        contentSx={{ minHeight: 330 }}
        actions={
          <Button
            variant="contained"
            onClick={save}
            disabled={
              saving || loading || Boolean(libraryId && (!details || !dirty))
            }
          >
            {saving ? "Saving..." : "Save"}
          </Button>
        }
      >
        {query.error && libraryId && (
          <Alert
            severity="error"
            sx={{ mb: 2 }}
            action={<Button onClick={() => query.refetch()}>Retry</Button>}
          >
            {query.error.message}
          </Alert>
        )}
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
            <CircularProgress />
          </Box>
        ) : (
          <>
            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}
            {tab === 0 && (
              <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {!libraryId && (
                  <FormControl fullWidth>
                    <InputLabel>Library type</InputLabel>
                    <Select
                      disabled={saving}
                      label="Library type"
                      value={type}
                      onChange={(event) =>
                        setGeneral((current) => ({
                          ...current,
                          type: event.target.value as ManagedLibraryType,
                        }))
                      }
                    >
                      {LIBRARY_TYPES.map((item) => (
                        <MenuItem key={item.value} value={item.value}>
                          {item.label}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                )}
                <TextField
                  disabled={saving}
                  label="Name"
                  value={name}
                  onChange={(event) =>
                    setGeneral((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  fullWidth
                  autoFocus
                />
                <FormControl fullWidth>
                  <InputLabel id="library-language-label">Language</InputLabel>
                  <Select
                    disabled={saving}
                    labelId="library-language-label"
                    label="Language"
                    value={language}
                    onChange={(event) =>
                      setGeneral((current) => ({
                        ...current,
                        language: String(event.target.value),
                      }))
                    }
                  >
                    {!LIBRARY_LANGUAGES.some(([code]) => code === language) && (
                      <MenuItem value={language}>{language}</MenuItem>
                    )}
                    {LIBRARY_LANGUAGES.map(([code, label]) => (
                      <MenuItem key={code} value={code}>
                        {label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Box>
            )}
            {tab === 1 && (
              <Box>
                <Box
                  sx={{ display: "flex", justifyContent: "flex-end", mb: 1 }}
                >
                  <Button
                    disabled={saving}
                    startIcon={<AddRounded />}
                    onClick={() => setFolderOpen(true)}
                  >
                    Add folder
                  </Button>
                </Box>
                <List disablePadding>
                  {locations.map((path) => (
                    <ListItem
                      key={path}
                      secondaryAction={
                        <Tooltip title="Remove folder">
                          <IconButton
                            disabled={saving}
                            onClick={() =>
                              setGeneral((current) => ({
                                ...current,
                                locations: locations.filter(
                                  (item) => item !== path,
                                ),
                              }))
                            }
                          >
                            <DeleteOutlineRounded />
                          </IconButton>
                        </Tooltip>
                      }
                    >
                      <ListItemIcon>
                        <FolderRounded />
                      </ListItemIcon>
                      <ListItemText
                        primary={path}
                        slotProps={{
                          primary: { sx: { fontFamily: "monospace" } },
                        }}
                      />
                    </ListItem>
                  ))}
                  {!locations.length && (
                    <ListItem>
                      <ListItemText primary="No folders selected." />
                    </ListItem>
                  )}
                </List>
              </Box>
            )}
            {tab === 2 && (
              <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {visiblePreferences.map((setting) => (
                  <PreferenceField
                    key={setting.id}
                    preference={setting}
                    value={preferences.draft[setting.id] ?? setting.value}
                    onChange={(value) =>
                      preferences.setValue(setting.id, value)
                    }
                    disabled={saving}
                  />
                ))}
                {!visiblePreferences.length && (
                  <Typography sx={{ color: "text.secondary" }}>
                    No advanced settings are available.
                  </Typography>
                )}
              </Box>
            )}
          </>
        )}
      </AppDialog>
      <FolderBrowser
        open={folderOpen}
        onClose={() => setFolderOpen(false)}
        onSelect={(path) => {
          setGeneral((current) => ({
            ...current,
            locations: locations.includes(path)
              ? locations
              : [...locations, path],
          }));
          setFolderOpen(false);
        }}
      />
    </>
  );
}

export default function SettingsLibrariesAdmin() {
  const revision = useAuthSession((state) => state.revision);
  const { serverId } = useActiveServerScope();
  return <LibraryAdministration key={`${serverId}:${revision}`} />;
}

function LibraryAdministration() {
  const canManageServer = useCanManageServer();
  const [searchParams, setSearchParams] = useSearchParams();
  const query = useManagedLibraries();
  const libraries = query.data ?? [];
  const change = useLibraryChange();
  const [notice, setNotice] = useState("");
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [menuLibrary, setMenuLibrary] = useState<
    (typeof libraries)[number] | null
  >(null);
  const [confirmAction, setConfirmAction] = useState<
    "refresh-metadata" | "empty-trash" | null
  >(null);
  const editing = searchParams.get("edit");
  const deleting = searchParams.get("delete");
  const adding = searchParams.has("add");

  const deleteTarget =
    libraries.find((library) => library.id === deleting) || null;

  if (!canManageServer) return <Navigate to="/settings/account" replace />;

  const closeEditor = () => setSearchParams({});
  const changed = (message: string) => {
    closeEditor();
    setNotice(message);
  };
  const performAction = async (
    action: "scan" | "refresh-metadata" | "analyze" | "empty-trash",
  ) => {
    if (!menuLibrary) return;
    try {
      await change.mutateAsync({ type: "action", id: menuLibrary.id, action });
      setNotice(
        action === "scan" ? "Library scan started." : "Library action started.",
      );
      setMenuAnchor(null);
      return true;
    } catch (reason) {
      setNotice(errorMessage(reason));
      return false;
    }
  };

  return (
    <Box sx={{ width: "100%" }}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 2,
          mb: 2,
        }}
      >
        <Box>
          <Typography variant="h4">Libraries</Typography>
          <Typography sx={{ color: "text.secondary" }}>
            Create and maintain Plex libraries.
          </Typography>
        </Box>
        <Button
          component={Link}
          to="/settings/manage-libraries?add=1"
          variant="contained"
          startIcon={<AddRounded />}
        >
          Add library
        </Button>
      </Box>
      <Divider />
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
                      component={Link}
                      to={`/settings/manage-libraries?edit=${library.id}`}
                    >
                      <EditRounded />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Library actions">
                    <IconButton
                      sx={menuDotsSx}
                      onClick={(event) => {
                        setMenuLibrary(library);
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
          component={Link}
          to={`/settings/manage-libraries?edit=${menuLibrary?.id || ""}`}
          onClick={() => setMenuAnchor(null)}
        >
          <ListItemText>Edit</ListItemText>
        </MenuItem>
        <Divider />
        <MenuItem onClick={() => performAction("scan")}>
          <ListItemText>Scan library files</ListItemText>
        </MenuItem>
        <MenuItem
          onClick={() => {
            setConfirmAction("refresh-metadata");
            setMenuAnchor(null);
          }}
        >
          <ListItemText>Refresh all metadata</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => performAction("analyze")}>
          <ListItemText>Analyze</ListItemText>
        </MenuItem>
        <MenuItem
          onClick={() => {
            setConfirmAction("empty-trash");
            setMenuAnchor(null);
          }}
        >
          <ListItemText>Empty trash</ListItemText>
        </MenuItem>
        <Divider />
        <MenuItem
          component={Link}
          to={`/settings/manage-libraries?delete=${menuLibrary?.id || ""}`}
          sx={{ color: "error.main" }}
          onClick={() => setMenuAnchor(null)}
        >
          <ListItemText>Delete library</ListItemText>
        </MenuItem>
      </Menu>

      {(adding || editing) && (
        <LibraryEditor
          key={editing ?? "add"}
          open
          libraryId={editing}
          onClose={closeEditor}
          onSaved={changed}
        />
      )}
      <ConfirmDialog
        open={Boolean(deleting)}
        title={`Delete ${deleteTarget?.title || "library"}?`}
        message="This removes the library from Plex but does not delete its media files."
        busy={change.isPending}
        onClose={closeEditor}
        onConfirm={async () => {
          if (!deleteTarget) return;
          try {
            await change.mutateAsync({
              type: "remove",
              id: deleteTarget.id,
              title: deleteTarget.title,
            });
            await changed("Library deleted.");
          } catch (reason) {
            setNotice(errorMessage(reason));
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
        onClose={() => setConfirmAction(null)}
        onConfirm={async () => {
          if (!confirmAction) return;
          if (await performAction(confirmAction)) setConfirmAction(null);
        }}
        confirmLabel="Continue"
        busyLabel="Working..."
        confirmColor={confirmAction === "empty-trash" ? "error" : "primary"}
      />
      <Snackbar
        open={Boolean(notice)}
        autoHideDuration={5000}
        onClose={() => setNotice("")}
        message={notice}
      />
    </Box>
  );
}
