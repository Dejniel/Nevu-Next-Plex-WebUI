import {
  Alert,
  Box,
  Button,
  CircularProgress,
  FormControlLabel,
  MenuItem,
  Snackbar,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { useState } from "react";
import { useAuthSession, useActiveServerScope } from "features/session/model";
import { useCanManageServer } from "features/session/public";
import {
  usePreferenceDraft,
  validatePreferenceChanges,
} from "entities/plex-preferences/model";
import { PreferenceField } from "entities/plex-preferences/public";
import { useServerPreferences } from "../model/useServerPreferences";
import {
  preferenceGroup,
  preferenceGroupLabel,
  SERVER_PREFERENCE_HINTS,
} from "../model/serverPreferences";

export default function SettingsServer() {
  const revision = useAuthSession((state) => state.revision);
  const { serverId } = useActiveServerScope();
  return <ServerPreferences key={`${serverId}:${revision}`} />;
}

function ServerPreferences() {
  const canManage = useCanManageServer();
  const { query, save } = useServerPreferences();
  const preferences = query.data ?? [];
  const draft = usePreferenceDraft(preferences);
  const [group, setGroup] = useState("");
  const [search, setSearch] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const groups = [...new Set(preferences.map(preferenceGroup))];
  const activeGroup = groups.includes(group) ? group : "";
  const term = search.trim().toLocaleLowerCase();
  const visible = preferences.filter(
    (setting) =>
      (advanced || !setting.advanced) &&
      (!activeGroup || preferenceGroup(setting) === activeGroup) &&
      (!term ||
        `${setting.label} ${setting.summary} ${setting.id}`
          .toLocaleLowerCase()
          .includes(term)),
  );
  const changed = Object.keys(draft.changes).length;

  const submit = async () => {
    setError("");
    setNotice("");
    try {
      const changes = validatePreferenceChanges(preferences, draft.draft);
      await save.mutateAsync(changes);
      draft.reset();
      const restart = Object.keys(changes).some(
        (id) => SERVER_PREFERENCE_HINTS[id]?.requiresRestart,
      );
      setNotice(
        restart
          ? "Settings saved. Restart Plex Media Server for the marked changes to take effect."
          : "Server settings saved.",
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not save server settings.",
      );
    }
  };

  return (
    <Box sx={{ width: "100%", minWidth: 0 }}>
      <Typography variant="h4">Plex server</Typography>
      {!canManage ? (
        <Alert severity="info" sx={{ mt: 3 }}>
          The active Plex profile cannot manage this server.
        </Alert>
      ) : (
        <>
          <Typography sx={{ color: "text.secondary", mt: 1, mb: 3 }}>
            Configure the connected Plex Media Server.
          </Typography>
          {query.error && (
            <Alert
              severity="error"
              sx={{ mb: 2 }}
              action={
                <Button color="inherit" onClick={() => query.refetch()}>
                  Retry
                </Button>
              }
            >
              {query.error.message}
            </Alert>
          )}
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          {query.isPending ? (
            <CircularProgress
              size={28}
              sx={{ display: "block", mx: "auto", my: 6 }}
            />
          ) : (
            query.data && (
              <>
                <Box
                  sx={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 2,
                    alignItems: "center",
                    mb: 3,
                  }}
                >
                  <TextField
                    select
                    label="Section"
                    value={activeGroup}
                    onChange={(event) => setGroup(event.target.value)}
                    slotProps={{
                      inputLabel: { shrink: true },
                      select: { displayEmpty: true },
                    }}
                    sx={{ width: { xs: "100%", sm: 200 } }}
                  >
                    <MenuItem value="">All settings</MenuItem>
                    {groups.map((value) => (
                      <MenuItem key={value} value={value}>
                        {preferenceGroupLabel(value)}
                      </MenuItem>
                    ))}
                  </TextField>
                  <TextField
                    label="Search settings"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    sx={{ flex: 1, minWidth: 180 }}
                  />
                  <FormControlLabel
                    control={
                      <Switch
                        checked={advanced}
                        onChange={(_, checked) => setAdvanced(checked)}
                      />
                    }
                    label="Show advanced"
                  />
                </Box>
                <fieldset
                  disabled={save.isPending}
                  style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
                >
                  {groups
                    .filter((value) =>
                      visible.some(
                        (setting) => preferenceGroup(setting) === value,
                      ),
                    )
                    .map((value) => (
                      <Box component="section" key={value} sx={{ mb: 4 }}>
                        <Typography variant="h6" sx={{ mb: 2 }}>
                          {preferenceGroupLabel(value)}
                        </Typography>
                        <Box
                          sx={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 2.5,
                          }}
                        >
                          {visible
                            .filter(
                              (setting) => preferenceGroup(setting) === value,
                            )
                            .map((setting) => (
                              <PreferenceField
                                key={setting.id}
                                preference={setting}
                                value={draft.draft[setting.id] ?? setting.value}
                                onChange={(next) =>
                                  draft.setValue(setting.id, next)
                                }
                                disabled={save.isPending}
                                note={
                                  SERVER_PREFERENCE_HINTS[setting.id]
                                    ?.description
                                }
                                password={
                                  SERVER_PREFERENCE_HINTS[setting.id]?.password
                                }
                              />
                            ))}
                        </Box>
                      </Box>
                    ))}
                </fieldset>
                {!visible.length && (
                  <Typography sx={{ color: "text.secondary", my: 3 }}>
                    No settings match these filters.
                  </Typography>
                )}
                <Box
                  sx={{
                    position: "sticky",
                    bottom: 12,
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    justifyContent: "flex-end",
                    gap: 2,
                    p: 2,
                    bgcolor: "background.paper",
                    borderRadius: 2,
                    zIndex: 1,
                  }}
                >
                  <Typography
                    variant="body2"
                    sx={{ mr: "auto", color: "text.secondary" }}
                  >
                    {changed
                      ? `${changed} unsaved ${changed === 1 ? "change" : "changes"}`
                      : "No unsaved changes"}
                  </Typography>
                  <Button
                    disabled={!changed || save.isPending}
                    onClick={() => {
                      draft.reset();
                      setError("");
                    }}
                  >
                    Discard
                  </Button>
                  <Button
                    variant="contained"
                    disabled={!changed || save.isPending}
                    onClick={submit}
                  >
                    {save.isPending ? "Saving..." : "Save changes"}
                  </Button>
                </Box>
              </>
            )
          )}
        </>
      )}
      <Snackbar
        open={Boolean(notice)}
        autoHideDuration={5000}
        onClose={() => setNotice("")}
        message={notice}
      />
    </Box>
  );
}
