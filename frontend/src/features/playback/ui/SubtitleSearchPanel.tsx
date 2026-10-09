import {
  CheckRounded,
  DownloadRounded,
  RefreshRounded,
  SearchRounded,
  StarRounded,
} from "@mui/icons-material";
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import React from "react";
import type { MediaMetadata, MediaVersion } from "entities/media/model";
import { searchSubtitles } from "../api/subtitles";
import { defaultSubtitleSearchTitle } from "../model/subtitles";
import type {
  SubtitleSearchPreference,
  SubtitleSearchResult,
} from "../model/subtitles";

const LANGUAGES = [
  ["ar", "Arabic"],
  ["bg", "Bulgarian"],
  ["ca", "Catalan"],
  ["zh", "Chinese"],
  ["hr", "Croatian"],
  ["cs", "Czech"],
  ["da", "Danish"],
  ["nl", "Dutch"],
  ["en", "English"],
  ["et", "Estonian"],
  ["fi", "Finnish"],
  ["fr", "French"],
  ["de", "German"],
  ["el", "Greek"],
  ["he", "Hebrew"],
  ["hu", "Hungarian"],
  ["id", "Indonesian"],
  ["it", "Italian"],
  ["ja", "Japanese"],
  ["ko", "Korean"],
  ["lv", "Latvian"],
  ["lt", "Lithuanian"],
  ["no", "Norwegian"],
  ["pl", "Polish"],
  ["pt", "Portuguese"],
  ["ro", "Romanian"],
  ["ru", "Russian"],
  ["sr", "Serbian"],
  ["sk", "Slovak"],
  ["sl", "Slovenian"],
  ["es", "Spanish"],
  ["sv", "Swedish"],
  ["th", "Thai"],
  ["tr", "Turkish"],
  ["uk", "Ukrainian"],
  ["vi", "Vietnamese"],
] as const;

interface SearchForm {
  title: string;
  language: string;
  hearingImpaired: SubtitleSearchPreference;
  forced: SubtitleSearchPreference;
}

function defaultLanguage() {
  const stored = localStorage.getItem("subtitleSearchLanguage");
  if (stored && LANGUAGES.some(([code]) => code === stored)) return stored;
  const browserLanguage = navigator.language.split("-")[0].toLowerCase();
  return LANGUAGES.some(([code]) => code === browserLanguage)
    ? browserLanguage
    : "en";
}

function initialForm(version: MediaVersion): SearchForm {
  return {
    title: defaultSubtitleSearchTitle(version.part.file),
    language: defaultLanguage(),
    hearingImpaired: 0,
    forced: 0,
  };
}

function formSignature(form: SearchForm) {
  return JSON.stringify(form);
}

export default function SubtitleSearchPanel({
  metadata,
  version,
  onDownload,
}: {
  metadata: MediaMetadata;
  version: MediaVersion;
  onDownload: (subtitle: SubtitleSearchResult) => Promise<void>;
}) {
  const originalTitle = defaultSubtitleSearchTitle(version.part.file);
  const [form, setForm] = React.useState<SearchForm>(() => initialForm(version));
  const [results, setResults] = React.useState<SubtitleSearchResult[] | null>(
    null,
  );
  const [lastSearch, setLastSearch] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [downloadingKey, setDownloadingKey] = React.useState<string | null>(
    null,
  );
  const request = React.useRef<AbortController | null>(null);

  const runSearch = async (criteria: SearchForm) => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError(null);
    localStorage.setItem("subtitleSearchLanguage", criteria.language);

    try {
      if (version.media.id === undefined) throw new Error("Plex did not identify this media version for subtitle searches.");
      const nextResults = await searchSubtitles(metadata.ratingKey, {
        ...criteria,
        mediaItemID: version.media.id,
      }, controller.signal);
      if (controller.signal.aborted) return;
      setResults(nextResults);
      setLastSearch(formSignature(criteria));
    } catch (searchError) {
      if (controller.signal.aborted) return;
      setResults(null);
      setError(
        searchError instanceof Error
          ? searchError.message
          : "Plex could not search for subtitles.",
      );
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  };

  React.useEffect(() => {
    void runSearch(form);
    return () => {
      request.current?.abort();
    };
    // Search once when this active file opens; edits require an explicit search.
    // oxlint-disable-next-line react/exhaustive-deps
  }, [metadata.ratingKey, version.media.id, version.part.id]);

  const criteriaChanged =
    Boolean(lastSearch) && lastSearch !== formSignature(form);

  const updatePreference = (
    field: "hearingImpaired" | "forced",
    value: unknown,
  ) => {
    setForm((current) => ({
      ...current,
      [field]: Number(value) as SubtitleSearchPreference,
    }));
  };

  const download = async (subtitle: SubtitleSearchResult) => {
    setDownloadingKey(subtitle.key);
    setError(null);
    try {
      await onDownload(subtitle);
    } catch (downloadError) {
      setError(
        downloadError instanceof Error
          ? downloadError.message
          : "Plex could not download this subtitle.",
      );
      setDownloadingKey(null);
    }
  };

  return (
    <Box sx={{ width: "100%" }}>
      <Box
        component="form"
        onSubmit={(event) => {
          event.preventDefault();
          void runSearch(form);
        }}
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "minmax(0, 1fr) auto auto",
            sm: "minmax(0, 1fr) 140px auto auto",
          },
          gap: 1,
          p: 1.5,
          alignItems: "center",
          backgroundColor: "rgba(0,0,0,0.5)",
        }}
      >
        <TextField
          label="Title or release name"
          value={form.title}
          onChange={(event) =>
            setForm((current) => ({ ...current, title: event.target.value }))
          }
          size="small"
          sx={{ gridColumn: { xs: "1 / -1", sm: "auto" } }}
        />
        <FormControl size="small">
          <InputLabel id="subtitle-language-label">Language</InputLabel>
          <Select
            labelId="subtitle-language-label"
            label="Language"
            value={form.language}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                language: String(event.target.value),
              }))
            }
          >
            {LANGUAGES.map(([code, label]) => (
              <MenuItem key={code} value={code}>
                {label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <Tooltip title="Restore the file name">
          <IconButton
            aria-label="Restore the file name"
            onClick={() =>
              setForm((current) => ({ ...current, title: originalTitle }))
            }
          >
            <RefreshRounded />
          </IconButton>
        </Tooltip>
        <Tooltip title="Search again">
          <span>
            <IconButton
              type="submit"
              aria-label="Search subtitles"
              color={criteriaChanged ? "primary" : "default"}
              disabled={loading}
            >
              {loading ? <CircularProgress size={22} /> : <SearchRounded />}
            </IconButton>
          </span>
        </Tooltip>

        <FormControl size="small" sx={{ gridColumn: { xs: "1 / -1", sm: "1 / 3" } }}>
          <InputLabel id="subtitle-forced-label">Forced subtitles</InputLabel>
          <Select
            labelId="subtitle-forced-label"
            label="Forced subtitles"
            value={form.forced}
            onChange={(event) => updatePreference("forced", event.target.value)}
          >
            <MenuItem value={0}>Prefer regular</MenuItem>
            <MenuItem value={1}>Prefer forced</MenuItem>
            <MenuItem value={2}>Forced only</MenuItem>
            <MenuItem value={3}>Exclude forced</MenuItem>
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ gridColumn: { xs: "1 / -1", sm: "3 / 5" } }}>
          <InputLabel id="subtitle-sdh-label">SDH subtitles</InputLabel>
          <Select
            labelId="subtitle-sdh-label"
            label="SDH subtitles"
            value={form.hearingImpaired}
            onChange={(event) =>
              updatePreference("hearingImpaired", event.target.value)
            }
          >
            <MenuItem value={0}>Prefer regular</MenuItem>
            <MenuItem value={1}>Prefer SDH</MenuItem>
            <MenuItem value={2}>SDH only</MenuItem>
            <MenuItem value={3}>Exclude SDH</MenuItem>
          </Select>
        </FormControl>

        {criteriaChanged && (
          <Typography variant="caption" sx={{ color: "primary.light", gridColumn: "1 / -1" }}>
            Search criteria changed. Press search or Enter to refresh results.
          </Typography>
        )}
      </Box>

      {error && <Alert severity="error" sx={{ borderRadius: 0 }}>{error}</Alert>}

      {!loading && results?.length === 0 && (
        <Typography sx={{ color: "text.secondary", py: 4, textAlign: "center" }}>
          No subtitles found.
        </Typography>
      )}

      {results?.map((subtitle) => {
        const downloading = downloadingKey === subtitle.key;
        const detail = [
          subtitle.language || subtitle.languageCode,
          subtitle.codec?.toUpperCase(),
          subtitle.providerTitle,
          subtitle.score !== undefined ? `Score ${subtitle.score}` : null,
        ]
          .filter(Boolean)
          .join(" · ");

        return (
          <Box
            component="button"
            type="button"
            key={subtitle.key}
            disabled={Boolean(downloadingKey) || subtitle.downloaded}
            onClick={() => void download(subtitle)}
            sx={{
              width: "100%",
              minHeight: 62,
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) auto",
              alignItems: "center",
              gap: 1.5,
              px: 2,
              py: 1,
              border: 0,
              borderBottom: "1px solid",
              borderColor: "divider",
              color: "text.primary",
              backgroundColor: "rgba(0,0,0,0.5)",
              textAlign: "left",
              cursor: subtitle.downloaded ? "default" : "pointer",
              "&:hover:not(:disabled)": { backgroundColor: "rgba(0,0,0,0.9)" },
              "&:disabled": { color: "text.secondary" },
            }}
          >
            <Box sx={{ minWidth: 0 }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
                  {subtitle.title}
                </Typography>
                {subtitle.perfectMatch && (
                  <Tooltip title="Exact file hash match">
                    <StarRounded color="primary" sx={{ fontSize: 17, flexShrink: 0 }} />
                  </Tooltip>
                )}
              </Box>
              <Typography
                variant="caption"
                noWrap
                sx={{ color: "text.secondary", display: "block" }}
              >
                {detail}
              </Typography>
              {(subtitle.forced || subtitle.hearingImpaired) && (
                <Box sx={{ display: "flex", gap: 0.5, mt: 0.5 }}>
                  {subtitle.forced && <Chip label="Forced" size="small" />}
                  {subtitle.hearingImpaired && <Chip label="SDH" size="small" />}
                </Box>
              )}
            </Box>
            {downloading ? (
              <CircularProgress size={22} />
            ) : subtitle.downloaded ? (
              <CheckRounded color="primary" />
            ) : (
              <DownloadRounded />
            )}
          </Box>
        );
      })}
    </Box>
  );
}
