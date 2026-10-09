import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  List,
  ListItemButton,
  MenuItem,
  Radio,
  TextField,
  Typography,
} from "@mui/material";
import { MovieOutlined, MusicNoteOutlined } from "@mui/icons-material";
import type { MediaItemData } from "entities/media/model";
import { AppDialog } from "shared/ui";
import { useMetadataMatch } from "../model/useMetadataMatch";
import {
  matchActionLabel,
  matchSourceLabel,
} from "../model/matching";

const languages = [
  ["", "Library default"],
  ["pl-PL", "Polish"],
  ["en-US", "English (US)"],
  ["en-GB", "English (UK)"],
  ["de-DE", "German"],
  ["fr-FR", "French"],
  ["es-ES", "Spanish"],
  ["it-IT", "Italian"],
] as const;

export default function MatchMetadataDialog({
  item,
  onClose,
  onSaved,
}: {
  item: MediaItemData;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const model = useMetadataMatch(item, onClose, onSaved);
  const {
    criteria,
    setCriteria,
    candidates,
    selected,
    searching,
    applying,
    searched,
    error,
    errors,
  } = model;
  const selectedGuid = selected?.guid;
  const music = item.type === "artist" || item.type === "album";

  return (
    <AppDialog
      open
      title={`${matchActionLabel(item)}: ${item.title}`}
      onClose={onClose}
      busy={applying}
      actions={
        <Button
          variant="contained"
          disabled={!model.canApply}
          onClick={() => void model.apply()}
          startIcon={applying ? <CircularProgress size={16} /> : undefined}
        >
          {matchActionLabel(item)}
        </Button>
      }
      contentSx={{ p: { xs: 2, sm: 3 } }}
    >
      <Box
        component="form"
        onSubmit={(event) => {
          event.preventDefault();
          model.search();
        }}
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "1fr",
            sm: "minmax(0, 1fr) minmax(0, 1fr)",
            md:
              item.type === "artist"
                ? "minmax(0, 1fr) minmax(0, 1fr) auto"
                : "120px minmax(0, 1fr) minmax(0, 1fr) auto",
          },
          gap: 1.5,
          alignItems: "start",
          mb: 2,
        }}
      >
        <TextField
          autoFocus
          required
          size="small"
          label={
            item.type === "artist"
              ? "Artist or ID"
              : item.type === "album"
                ? "Album or ID"
                : "Title or ID"
          }
          value={criteria.title}
          error={Boolean(errors.title)}
          helperText={
            errors.title ||
            (music
              ? "MusicBrainz ID or link; albums use the release ID."
              : item.type === "show"
                ? "IMDb, TMDB or TVDB ID/link, e.g. tvdb-110381."
                : "IMDb or TMDB ID/link, e.g. imdb-tt1217209.")
          }
          sx={{ gridColumn: "1 / -1" }}
          disabled={searching || applying}
          onChange={(event) =>
            setCriteria((current) => ({
              ...current,
              title: event.target.value,
            }))
          }
        />
        {item.type !== "artist" && (
          <TextField
            size="small"
            type="number"
            label="Year"
            value={criteria.year ?? ""}
            error={Boolean(errors.year)}
            helperText={errors.year}
            disabled={searching || applying || Boolean(model.identifier)}
            onChange={(event) =>
              setCriteria((current) => ({
                ...current,
                year: event.target.value
                  ? Number(event.target.value)
                  : undefined,
              }))
            }
            slotProps={{ htmlInput: { min: 1870, max: 2200 } }}
          />
        )}
        <TextField
          select
          size="small"
          label="Language"
          value={criteria.language ?? ""}
          disabled={searching || applying}
          onChange={(event) =>
            setCriteria((current) => ({
              ...current,
              language: event.target.value,
            }))
          }
          slotProps={{
            inputLabel: { shrink: true },
            select: { displayEmpty: true },
          }}
        >
          {languages.map(([value, label]) => (
            <MenuItem key={value} value={value}>
              {label}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          size="small"
          label="Metadata agent"
          value={criteria.agent ?? ""}
          disabled={searching || applying || model.agentsLoading}
          onChange={(event) =>
            setCriteria((current) => ({
              ...current,
              agent: event.target.value,
            }))
          }
          slotProps={{
            inputLabel: { shrink: true },
            select: { displayEmpty: true },
          }}
        >
          <MenuItem value="">Library default</MenuItem>
          {model.agents.map((agent) => (
            <MenuItem key={agent.identifier} value={agent.identifier}>
              {agent.name}
            </MenuItem>
          ))}
        </TextField>
        <Button
          type="submit"
          variant="outlined"
          disabled={
            Boolean(Object.keys(errors).length) || searching || applying
          }
          sx={{ minHeight: 40 }}
        >
          {searching ? <CircularProgress size={18} /> : "Search"}
        </Button>
      </Box>

      {model.agentsError && (
        <Alert
          severity="warning"
          sx={{ mb: 2 }}
          action={
            <Button color="inherit" onClick={model.retryAgents}>
              Retry
            </Button>
          }
        >
          {model.agentsError}
        </Alert>
      )}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {searching && candidates.length === 0 ? (
        <Box sx={{ minHeight: 220, display: "grid", placeItems: "center" }}>
          <CircularProgress />
        </Box>
      ) : searched && candidates.length === 0 && !error ? (
        <Alert severity="info">
          No matches found. Adjust the search criteria and try again.
        </Alert>
      ) : (
        <List disablePadding sx={{ display: "grid", gap: 1 }}>
          {candidates.map((candidate) => {
            const selectedCandidate = candidate.guid === selectedGuid;
            const current = candidate.guid === item.guid;
            return (
              <ListItemButton
                key={candidate.guid}
                selected={selectedCandidate}
                onClick={() => model.select(candidate.guid)}
                sx={{
                  display: "grid",
                  gridTemplateColumns: "auto 64px minmax(0, 1fr)",
                  gap: 1.5,
                  alignItems: "center",
                  border: "1px solid",
                  borderColor: selectedCandidate ? "primary.main" : "divider",
                  borderRadius: 1,
                }}
              >
                <Radio checked={selectedCandidate} tabIndex={-1} />
                <Box
                  sx={{
                    width: 64,
                    aspectRatio: music ? "1" : "2 / 3",
                    bgcolor: "background.default",
                    display: "grid",
                    placeItems: "center",
                    overflow: "hidden",
                    borderRadius: 0.5,
                  }}
                >
                  {candidate.thumb ? (
                    <Box
                      component="img"
                      src={candidate.thumb}
                      alt=""
                      loading="lazy"
                      sx={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  ) : music ? (
                    <MusicNoteOutlined color="disabled" />
                  ) : (
                    <MovieOutlined color="disabled" />
                  )}
                </Box>
                <Box sx={{ minWidth: 0 }}>
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1,
                      flexWrap: "wrap",
                    }}
                  >
                    <Typography noWrap sx={{ fontWeight: 700 }}>
                      {candidate.name}
                    </Typography>
                    {candidate.year && (
                      <Typography sx={{ color: "text.secondary" }}>
                        {candidate.year}
                      </Typography>
                    )}
                    {current && <Chip size="small" label="Current match" />}
                  </Box>
                  <Typography variant="body2" sx={{ color: "text.secondary" }}>
                    {[candidate.parentName, matchSourceLabel(candidate.guid)]
                      .filter(Boolean)
                      .join(" · ")}
                  </Typography>
                  {candidate.summary && (
                    <Typography
                      variant="body2"
                      sx={{
                        mt: 0.5,
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                    >
                      {candidate.summary}
                    </Typography>
                  )}
                </Box>
              </ListItemButton>
            );
          })}
        </List>
      )}
    </AppDialog>
  );
}
