import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  List,
  ListItemButton,
  Radio,
  TextField,
  Typography,
} from "@mui/material";
import { MovieOutlined } from "@mui/icons-material";
import React, { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import type { MediaItemData } from "entities/media/model";
import { PlexRequestError } from "features/session/model";
import { AppDialog } from "shared/ui";
import { applyMetadataMatch, searchMetadataMatches } from "../api/matching";
import {
  matchActionLabel,
  matchSourceLabel,
  MetadataMatchCandidate,
  MetadataMatchCriteria,
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

function requestError(error: unknown, operation: "search" | "apply") {
  if (error instanceof PlexRequestError) {
    if (error.status === 401 || error.status === 403)
      return "Matching metadata requires Plex server administrator access.";
    if (error.status === 404)
      return "This item no longer exists in the Plex library.";
  }
  return operation === "search"
    ? "Plex could not search for metadata matches."
    : "Plex could not apply the selected metadata match.";
}

export default function MatchMetadataDialog({
  item,
  open,
  onClose,
  onMatched,
}: {
  item: MediaItemData;
  open: boolean;
  onClose: () => void;
  onMatched?: (candidate: MetadataMatchCandidate) => void | Promise<void>;
}) {
  const initialTitle =
    "originalTitle" in item && item.originalTitle
      ? item.originalTitle
      : item.title;
  const initialCriteria = (): MetadataMatchCriteria => ({
    title: initialTitle,
    year: item.year || undefined,
    language: "",
  });
  const [criteria, setCriteria] = useState(initialCriteria);
  const [candidates, setCandidates] = useState<MetadataMatchCandidate[]>([]);
  const [selectedGuid, setSelectedGuid] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [applying, setApplying] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchGeneration = useRef(0);

  const search = useCallback(
    async (nextCriteria: MetadataMatchCriteria) => {
      const generation = ++searchGeneration.current;
      setSearching(true);
      setSearched(false);
      setError(null);
      try {
        const results = await searchMetadataMatches(item.ratingKey, nextCriteria);
        if (generation !== searchGeneration.current) return;
        setCandidates(results);
        setSelectedGuid(
          results.find((candidate) => candidate.guid !== item.guid)?.guid ??
            results[0]?.guid ??
            null,
        );
        setSearched(true);
      } catch (error) {
        if (generation !== searchGeneration.current) return;
        setCandidates([]);
        setSelectedGuid(null);
        setSearched(true);
        setError(requestError(error, "search"));
      } finally {
        if (generation === searchGeneration.current) setSearching(false);
      }
    },
    [item.guid, item.ratingKey],
  );

  useEffect(() => {
    if (!open) {
      searchGeneration.current += 1;
      return;
    }
    const nextCriteria = initialCriteria();
    setCriteria(nextCriteria);
    setCandidates([]);
    setSelectedGuid(null);
    setError(null);
    void search(nextCriteria);
    // The dialog is reset for a new item or each explicit open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item.ratingKey, search]);

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    const title = criteria.title.trim();
    if (!title || searching || applying) return;
    void search({ ...criteria, title });
  };

  const selected = candidates.find((candidate) => candidate.guid === selectedGuid);
  const invalidYear =
    criteria.year !== undefined &&
    (!Number.isInteger(criteria.year) || criteria.year < 1870 || criteria.year > 2200);

  const apply = async () => {
    if (!selected || selected.guid === item.guid) return;
    setApplying(true);
    setError(null);
    try {
      await applyMetadataMatch(item.ratingKey, selected);
      await onMatched?.(selected);
      onClose();
    } catch (error) {
      setError(requestError(error, "apply"));
    } finally {
      setApplying(false);
    }
  };

  return (
    <AppDialog
      open={open}
      title={`${matchActionLabel(item)}: ${item.title}`}
      onClose={onClose}
      busy={applying}
      actions={
        <Button
          variant="contained"
          disabled={!selected || selected.guid === item.guid || applying}
          onClick={apply}
          startIcon={applying ? <CircularProgress size={16} /> : undefined}
        >
          {matchActionLabel(item)}
        </Button>
      }
      contentSx={{ p: { xs: 2, sm: 3 } }}
    >
      <Box
        component="form"
        onSubmit={submitSearch}
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", sm: "minmax(240px, 1fr) 120px 170px auto" },
          gap: 1.5,
          alignItems: "start",
          mb: 2,
        }}
      >
        <TextField
          autoFocus
          required
          size="small"
          label="Title"
          value={criteria.title}
          disabled={searching || applying}
          onChange={(event) =>
            setCriteria((current) => ({ ...current, title: event.target.value }))
          }
        />
        <TextField
          size="small"
          type="number"
          label="Year"
          value={criteria.year ?? ""}
          error={invalidYear}
          disabled={searching || applying}
          onChange={(event) =>
            setCriteria((current) => ({
              ...current,
              year: event.target.value ? Number(event.target.value) : undefined,
            }))
          }
          slotProps={{ htmlInput: { min: 1870, max: 2200 } }}
        />
        <TextField
          select
          size="small"
          label="Language"
          value={criteria.language ?? ""}
          disabled={searching || applying}
          onChange={(event) =>
            setCriteria((current) => ({ ...current, language: event.target.value }))
          }
          slotProps={{ select: { native: true } }}
        >
          {languages.map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </TextField>
        <Button
          type="submit"
          variant="outlined"
          disabled={!criteria.title.trim() || invalidYear || searching || applying}
          sx={{ minHeight: 40 }}
        >
          {searching ? <CircularProgress size={18} /> : "Search"}
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {searching && candidates.length === 0 ? (
        <Box sx={{ minHeight: 220, display: "grid", placeItems: "center" }}>
          <CircularProgress />
        </Box>
      ) : searched && candidates.length === 0 && !error ? (
        <Alert severity="info">No matches found. Adjust the search criteria and try again.</Alert>
      ) : (
        <List disablePadding sx={{ display: "grid", gap: 1 }}>
          {candidates.map((candidate) => {
            const selectedCandidate = candidate.guid === selectedGuid;
            const current = candidate.guid === item.guid;
            return (
              <ListItemButton
                key={candidate.guid}
                selected={selectedCandidate}
                onClick={() => setSelectedGuid(candidate.guid)}
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
                    aspectRatio: "2 / 3",
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
                  ) : (
                    <MovieOutlined color="disabled" />
                  )}
                </Box>
                <Box sx={{ minWidth: 0 }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                    <Typography fontWeight={700} noWrap>{candidate.name}</Typography>
                    {candidate.year && <Typography color="text.secondary">{candidate.year}</Typography>}
                    {current && <Chip size="small" label="Current match" />}
                  </Box>
                  <Typography variant="body2" color="text.secondary">
                    {matchSourceLabel(candidate.guid)} · {candidate.guid}
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
