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
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
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
  Switch,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import {
  browseLibraryFolders,
  createLibrary,
  deleteLibrary,
  getManagedLibraries,
  getManagedLibrary,
  LibraryDetails,
  LibraryFolder,
  LibraryInput,
  LibraryPreference,
  ManagedLibrary,
  ManagedLibraryType,
  runLibraryAction,
  updateLibrary,
} from "../../plex/libraries";
import { useAuthSession } from "../../states/AuthSessionState";
import { notifyLibrariesChanged } from "../../states/LibrariesState";

const ROOT_BROWSE_KEY = "/services/browse/Lw==";
const LIBRARY_TYPES: Array<{ value: ManagedLibraryType; label: string }> = [
  { value: "movie", label: "Movies" },
  { value: "show", label: "TV shows" },
  { value: "artist", label: "Music" },
  { value: "photo", label: "Photos" },
  { value: "video", label: "Other videos" },
];

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Plex library request failed.";
}

function libraryIcon(type: string) {
  switch (type) {
    case "movie": return <LocalMoviesRounded />;
    case "show": return <TvRounded />;
    case "artist": return <LibraryMusicRounded />;
    case "photo": return <PhotoLibraryRounded />;
    default: return <VideoLibraryRounded />;
  }
}

function parseEnum(value: string) {
  return value.split("|").filter(Boolean).map((entry) => {
    const separator = entry.indexOf(":");
    return separator < 0
      ? { value: entry, label: entry }
      : { value: entry.slice(0, separator), label: entry.slice(separator + 1) };
  });
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
  const [folders, setFolders] = useState<LibraryFolder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const current = history[history.length - 1];

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    browseLibraryFolders(current.key)
      .then((paths) => {
        if (!cancelled) setFolders(paths.filter((folder) => folder.path !== current.path));
      })
      .catch((reason) => !cancelled && setError(errorMessage(reason)))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [current.key, current.path, open]);

  useEffect(() => {
    if (open) setHistory([{ key: ROOT_BROWSE_KEY, path: "/" }]);
  }, [open]);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Select folder</DialogTitle>
      <DialogContent sx={{ px: 0 }}>
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
          <Typography noWrap sx={{ fontFamily: "monospace", flex: 1 }}>{current.path}</Typography>
          <Button
            variant="contained"
            disabled={current.path === "/"}
            onClick={() => onSelect(current.path)}
          >
            Select
          </Button>
        </Box>
        <Divider />
        {error && <Alert severity="error" sx={{ m: 2 }}>{error}</Alert>}
        {loading ? (
          <Box sx={{ py: 6, display: "flex", justifyContent: "center" }}><CircularProgress /></Box>
        ) : (
          <List disablePadding sx={{ maxHeight: "50vh", overflowY: "auto" }}>
            {folders.map((folder) => (
              <ListItemButton
                key={folder.key}
                onClick={() => setHistory((items) => [...items, { key: folder.key, path: folder.path }])}
              >
                <ListItemIcon><FolderRounded /></ListItemIcon>
                <ListItemText primary={folder.title} secondary={folder.path} />
              </ListItemButton>
            ))}
            {!folders.length && !error && <ListItem><ListItemText primary="No folders found." /></ListItem>}
          </List>
        )}
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Cancel</Button></DialogActions>
    </Dialog>
  );
}

function PreferenceField({
  preference,
  value,
  onChange,
}: {
  preference: LibraryPreference;
  value: string;
  onChange: (value: string) => void;
}) {
  const choices = parseEnum(preference.enumValues);
  if (preference.type === "bool") {
    return (
      <FormControlLabel
        control={<Switch checked={["true", "1"].includes(value)} onChange={(_, checked) => onChange(checked ? "true" : "false")} />}
        label={preference.label}
      />
    );
  }
  if (choices.length) {
    return (
      <FormControl fullWidth size="small">
        <InputLabel>{preference.label}</InputLabel>
        <Select label={preference.label} value={value} onChange={(event) => onChange(String(event.target.value))}>
          {choices.map((choice) => <MenuItem key={choice.value} value={choice.value}>{choice.label}</MenuItem>)}
        </Select>
        {preference.summary && <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>{preference.summary}</Typography>}
      </FormControl>
    );
  }
  return (
    <TextField
      fullWidth
      size="small"
      type={preference.type === "int" ? "number" : "text"}
      label={preference.label}
      helperText={preference.summary}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
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
  const [details, setDetails] = useState<LibraryDetails | null>(null);
  const [type, setType] = useState<ManagedLibraryType>("movie");
  const [name, setName] = useState("");
  const [language, setLanguage] = useState("en-US");
  const [locations, setLocations] = useState<string[]>([]);
  const [preferences, setPreferences] = useState<Record<string, string>>({});
  const [tab, setTab] = useState(0);
  const [folderOpen, setFolderOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setTab(0);
    setError("");
    if (!libraryId) {
      setDetails(null);
      setType("movie");
      setName("");
      setLanguage("en-US");
      setLocations([]);
      setPreferences({});
      return;
    }
    let cancelled = false;
    setLoading(true);
    getManagedLibrary(libraryId)
      .then((result) => {
        if (cancelled) return;
        setDetails(result);
        setName(result.library.title);
        setLanguage(result.library.language);
        setLocations(result.library.locations);
        setPreferences(Object.fromEntries(
          result.preferences
            .filter((setting) => !setting.hidden && setting.id)
            .map((setting) => [setting.id, String(setting.value ?? "")]),
        ));
      })
      .catch((reason) => !cancelled && setError(errorMessage(reason)))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [libraryId, open]);

  const save = async () => {
    if (!name.trim() || !locations.length) {
      setError("Enter a library name and select at least one folder.");
      return;
    }
    setSaving(true);
    setError("");
    const input: LibraryInput = { name: name.trim(), language, locations };
    try {
      if (libraryId) {
        input.preferences = preferences;
        await updateLibrary(libraryId, input);
      } else {
        input.type = type;
        await createLibrary(input);
      }
      onSaved(libraryId ? "Library updated." : "Library created.");
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setSaving(false);
    }
  };

  const visiblePreferences = details?.preferences.filter((setting) => !setting.hidden && setting.id) || [];
  return (
    <>
      <Dialog open={open} onClose={saving ? undefined : onClose} fullWidth maxWidth="md">
        <DialogTitle>{libraryId ? `Edit ${details?.library.title || "library"}` : "Add library"}</DialogTitle>
        <Tabs value={tab} onChange={(_, value) => setTab(value)} sx={{ px: 3 }}>
          <Tab label="General" />
          <Tab label="Folders" />
          {libraryId && <Tab label="Advanced" />}
        </Tabs>
        <Divider />
        <DialogContent sx={{ minHeight: 330 }}>
          {loading ? <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}><CircularProgress /></Box> : (
            <>
              {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
              {tab === 0 && (
                <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {!libraryId && (
                    <FormControl fullWidth>
                      <InputLabel>Library type</InputLabel>
                      <Select label="Library type" value={type} onChange={(event) => setType(event.target.value as ManagedLibraryType)}>
                        {LIBRARY_TYPES.map((item) => <MenuItem key={item.value} value={item.value}>{item.label}</MenuItem>)}
                      </Select>
                    </FormControl>
                  )}
                  <TextField label="Name" value={name} onChange={(event) => setName(event.target.value)} fullWidth autoFocus />
                  <TextField label="Language" value={language} onChange={(event) => setLanguage(event.target.value)} fullWidth helperText="Plex language code, for example en-US or pl-PL." />
                </Box>
              )}
              {tab === 1 && (
                <Box>
                  <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 1 }}>
                    <Button startIcon={<AddRounded />} onClick={() => setFolderOpen(true)}>Add folder</Button>
                  </Box>
                  <List disablePadding>
                    {locations.map((path) => (
                      <ListItem
                        key={path}
                        secondaryAction={<Tooltip title="Remove folder"><IconButton onClick={() => setLocations((items) => items.filter((item) => item !== path))}><DeleteOutlineRounded /></IconButton></Tooltip>}
                      >
                        <ListItemIcon><FolderRounded /></ListItemIcon>
                        <ListItemText primary={path} primaryTypographyProps={{ sx: { fontFamily: "monospace" } }} />
                      </ListItem>
                    ))}
                    {!locations.length && <ListItem><ListItemText primary="No folders selected." /></ListItem>}
                  </List>
                </Box>
              )}
              {tab === 2 && (
                <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {visiblePreferences.map((setting) => (
                    <PreferenceField
                      key={setting.id}
                      preference={setting}
                      value={preferences[setting.id] ?? ""}
                      onChange={(value) => setPreferences((current) => ({ ...current, [setting.id]: value }))}
                    />
                  ))}
                  {!visiblePreferences.length && <Typography color="text.secondary">No advanced settings are available.</Typography>}
                </Box>
              )}
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={saving}>Cancel</Button>
          <Button variant="contained" onClick={save} disabled={saving || loading}>{saving ? "Saving..." : "Save"}</Button>
        </DialogActions>
      </Dialog>
      <FolderBrowser
        open={folderOpen}
        onClose={() => setFolderOpen(false)}
        onSelect={(path) => {
          setLocations((items) => items.includes(path) ? items : [...items, path]);
          setFolderOpen(false);
        }}
      />
    </>
  );
}

export default function SettingsLibrariesAdmin() {
  const { activeProfile } = useAuthSession();
  const [searchParams, setSearchParams] = useSearchParams();
  const [libraries, setLibraries] = useState<ManagedLibrary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [menuLibrary, setMenuLibrary] = useState<ManagedLibrary | null>(null);
  const [confirmAction, setConfirmAction] = useState<"refresh-metadata" | "empty-trash" | null>(null);
  const editing = searchParams.get("edit");
  const deleting = searchParams.get("delete");
  const adding = searchParams.has("add");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setLibraries(await getManagedLibraries());
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeProfile?.isOwner) void load();
  }, [activeProfile?.isOwner, load]);
  const deleteTarget = useMemo(() => libraries.find((library) => library.id === deleting) || null, [deleting, libraries]);

  if (!activeProfile?.isOwner) return <Navigate to="/settings/account" replace />;

  const closeEditor = () => setSearchParams({});
  const changed = async (message: string) => {
    closeEditor();
    setNotice(message);
    await load();
    notifyLibrariesChanged();
  };
  const performAction = async (action: "scan" | "refresh-metadata" | "analyze" | "empty-trash") => {
    if (!menuLibrary) return;
    try {
      await runLibraryAction(menuLibrary.id, action);
      setNotice(action === "scan" ? "Library scan started." : "Library action started.");
    } catch (reason) {
      setNotice(errorMessage(reason));
    }
    setMenuAnchor(null);
  };

  return (
    <Box sx={{ width: "100%" }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2, mb: 2 }}>
        <Box>
          <Typography variant="h4">Libraries</Typography>
          <Typography color="text.secondary">Create and maintain Plex libraries.</Typography>
        </Box>
        <Button variant="contained" startIcon={<AddRounded />} onClick={() => setSearchParams({ add: "1" })}>Add library</Button>
      </Box>
      <Divider />
      {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
      {loading ? (
        <Box sx={{ py: 8, display: "flex", justifyContent: "center" }}><CircularProgress /></Box>
      ) : (
        <List disablePadding>
          {libraries.map((library) => (
            <ListItem
              key={library.id}
              divider
              secondaryAction={
                <Box sx={{ display: "flex", alignItems: "center" }}>
                  <Tooltip title="Edit library"><IconButton onClick={() => setSearchParams({ edit: library.id })}><EditRounded /></IconButton></Tooltip>
                  <Tooltip title="Library actions"><IconButton onClick={(event) => { setMenuLibrary(library); setMenuAnchor(event.currentTarget); }}><MoreVertRounded /></IconButton></Tooltip>
                </Box>
              }
              sx={{ minHeight: 72, pr: 12 }}
            >
              <ListItemIcon>{libraryIcon(library.type)}</ListItemIcon>
              <ListItemText
                primary={library.title}
                secondary={`${library.locations.join(", ") || "No folders"}${library.refreshing ? " · Scanning" : ""}`}
                secondaryTypographyProps={{ noWrap: true }}
              />
            </ListItem>
          ))}
          {!libraries.length && !error && <ListItem><ListItemText primary="No Plex libraries found." /></ListItem>}
        </List>
      )}

      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={() => setMenuAnchor(null)}>
        <MenuItem onClick={() => { if (menuLibrary) setSearchParams({ edit: menuLibrary.id }); setMenuAnchor(null); }}><ListItemText>Edit</ListItemText></MenuItem>
        <Divider />
        <MenuItem onClick={() => performAction("scan")}><ListItemText>Scan library files</ListItemText></MenuItem>
        <MenuItem onClick={() => { setConfirmAction("refresh-metadata"); setMenuAnchor(null); }}><ListItemText>Refresh all metadata</ListItemText></MenuItem>
        <MenuItem onClick={() => performAction("analyze")}><ListItemText>Analyze</ListItemText></MenuItem>
        <MenuItem onClick={() => { setConfirmAction("empty-trash"); setMenuAnchor(null); }}><ListItemText>Empty trash</ListItemText></MenuItem>
        <Divider />
        <MenuItem sx={{ color: "error.main" }} onClick={() => { if (menuLibrary) setSearchParams({ delete: menuLibrary.id }); setMenuAnchor(null); }}><ListItemText>Delete library</ListItemText></MenuItem>
      </Menu>

      <LibraryEditor open={adding || Boolean(editing)} libraryId={editing} onClose={closeEditor} onSaved={changed} />
      <Dialog open={Boolean(deleting)} onClose={closeEditor}>
        <DialogTitle>Delete {deleteTarget?.title || "library"}?</DialogTitle>
        <DialogContent>
          <DialogContentText>This removes the library from Plex but does not delete its media files.</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeEditor}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            disabled={!deleteTarget}
            onClick={async () => {
              if (!deleteTarget) return;
              try {
                await deleteLibrary(deleteTarget.id, deleteTarget.title);
                await changed("Library deleted.");
              } catch (reason) {
                setNotice(errorMessage(reason));
              }
            }}
          >Delete</Button>
        </DialogActions>
      </Dialog>
      <Dialog open={confirmAction !== null} onClose={() => setConfirmAction(null)}>
        <DialogTitle>{confirmAction === "empty-trash" ? "Empty library trash?" : "Refresh all metadata?"}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {confirmAction === "empty-trash"
              ? "Plex will permanently remove unavailable items from this library."
              : "Plex will refresh metadata for every item in this library."}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmAction(null)}>Cancel</Button>
          <Button
            color={confirmAction === "empty-trash" ? "error" : "primary"}
            variant="contained"
            onClick={async () => {
              if (!confirmAction) return;
              await performAction(confirmAction);
              setConfirmAction(null);
            }}
          >Continue</Button>
        </DialogActions>
      </Dialog>
      <Snackbar open={Boolean(notice)} autoHideDuration={5000} onClose={() => setNotice("")} message={notice} />
    </Box>
  );
}
