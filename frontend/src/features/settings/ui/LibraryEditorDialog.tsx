import {
  AddRounded,
  DeleteOutlineRounded,
  FolderRounded,
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
  MenuItem,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { useState } from "react";
import type { ManagedLibraryType } from "entities/library/model";
import { PreferenceField } from "entities/plex-preferences/public";
import { AppDialog } from "shared/ui";
import { QueryErrorAlert } from "shared/ui/QueryErrorAlert";
import {
  useLibraryEditor,
  type LibraryEditorTab,
} from "../model/useLibraryEditor";
import { LIBRARY_TYPES, LIBRARY_LANGUAGES } from "./libraryFormChoices";
import LibraryFolderBrowser from "./LibraryFolderBrowser";

export default function LibraryEditorDialog({
  libraryId,
  onClose,
  onSaved,
}: {
  libraryId: string | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const model = useLibraryEditor(libraryId, onSaved);
  const {
    values,
    preferences,
    visiblePreferences,
    tab,
    loading,
    saving,
    error,
  } = model;
  const [folderOpen, setFolderOpen] = useState(false);
  return (
    <>
      <AppDialog
        open
        title={model.title}
        onClose={onClose}
        busy={saving}
        headerContent={
          <>
            <Tabs
              value={tab}
              onChange={(_, value: LibraryEditorTab) => model.setTab(value)}
              sx={{ px: 3 }}
            >
              <Tab value="general" label="General" disabled={saving} />
              <Tab value="folders" label="Folders" disabled={saving} />
              {model.editing && (
                <Tab value="advanced" label="Advanced" disabled={saving} />
              )}
            </Tabs>
            <Divider />
          </>
        }
        contentSx={{ minHeight: 330 }}
        actions={
          <Button
            variant="contained"
            onClick={() => void model.save()}
            disabled={!model.canSave}
          >
            {saving ? "Saving..." : "Save"}
          </Button>
        }
      >
        <QueryErrorAlert
          error={model.readError}
          hasData={model.available}
          onRetry={model.retry}
        />
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
            <CircularProgress />
          </Box>
        ) : model.available ? (
          <>
            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}
            {tab === "general" && (
              <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {!model.editing && (
                  <TextField
                    select
                    fullWidth
                    label="Library type"
                    value={values.type}
                    disabled={saving}
                    onChange={(event) =>
                      model.setField(
                        "type",
                        event.target.value as ManagedLibraryType,
                      )
                    }
                  >
                    {LIBRARY_TYPES.map(({ value, label }) => (
                      <MenuItem key={value} value={value}>
                        {label}
                      </MenuItem>
                    ))}
                  </TextField>
                )}
                <TextField
                  fullWidth
                  autoFocus
                  label="Name"
                  value={values.name}
                  disabled={saving}
                  onChange={(event) =>
                    model.setField("name", event.target.value)
                  }
                  error={Boolean(model.errors.name)}
                  helperText={model.errors.name}
                />
                {model.hasMetadataLanguage && (
                  <TextField
                    select
                    fullWidth
                    label="Language"
                    value={values.language}
                    disabled={saving}
                    onChange={(event) =>
                      model.setField("language", event.target.value)
                    }
                    error={Boolean(model.errors.language)}
                    helperText={model.errors.language}
                  >
                    {!LIBRARY_LANGUAGES.some(
                      ([code]) => code === values.language,
                    ) && (
                      <MenuItem value={values.language}>
                        {values.language}
                      </MenuItem>
                    )}
                    {LIBRARY_LANGUAGES.map(([code, label]) => (
                      <MenuItem key={code} value={code}>
                        {label}
                      </MenuItem>
                    ))}
                  </TextField>
                )}
              </Box>
            )}
            {tab === "folders" && (
              <Box>
                {model.errors.locations && (
                  <Alert severity="error" sx={{ mb: 2 }}>
                    {model.errors.locations}
                  </Alert>
                )}
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
                  {values.locations.map((path) => (
                    <ListItem
                      key={path}
                      secondaryAction={
                        <Tooltip title="Remove folder">
                          <IconButton
                            disabled={saving}
                            aria-label={`Remove folder ${path}`}
                            onClick={() => model.removeFolder(path)}
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
                  {!values.locations.length && (
                    <ListItem>
                      <ListItemText primary="No folders selected." />
                    </ListItem>
                  )}
                </List>
              </Box>
            )}
            {tab === "advanced" && (
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
        ) : null}
      </AppDialog>
      {folderOpen && (
        <LibraryFolderBrowser
          onClose={() => setFolderOpen(false)}
          onSelect={(path) => {
            model.addFolder(path);
            setFolderOpen(false);
          }}
        />
      )}
    </>
  );
}
