import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Collapse,
  Stack,
} from "@mui/material";
import { motion } from "motion/react";
import { QueryErrorAlert } from "shared/ui/QueryErrorAlert";
import { useEpisodeActions } from "../model/useEpisodeActions";
import type { TitleEpisodesModel } from "../model/useTitleEpisodes";
import EpisodeRow from "./EpisodeRow";

export default function TitleEpisodes({
  browser,
}: {
  browser: TitleEpisodesModel;
}) {
  const actions = useEpisodeActions(browser);
  const { selection } = actions;
  return (
    <Box sx={{ width: "100%" }}>
      <Collapse in={selection.active}>
        <Stack
          direction="row"
          role="group"
          aria-label="Selected episode actions"
          sx={{ flexWrap: "wrap", gap: 1, mb: 2, alignItems: "center" }}
        >
          <Button variant="contained" onClick={selection.clear}>
            Cancel
          </Button>
          <Button
            variant="contained"
            disabled={!browser.episodes.length}
            onClick={() =>
              selection.toggleAll(
                browser.episodes.map((episode) => episode.ratingKey),
              )
            }
          >
            {actions.allSelected ? "Unselect All" : "Select All"}
          </Button>
          <Button
            variant="contained"
            disabled={!actions.selectedCount}
            onClick={() => actions.request(true)}
          >
            Mark as Watched
          </Button>
          <Button
            variant="contained"
            disabled={!actions.selectedCount}
            onClick={() => actions.request(false)}
          >
            Mark as Unwatched
          </Button>
          <Box component="span" aria-live="polite">
            {actions.selectedCount} selected
          </Box>
        </Stack>
      </Collapse>
      <QueryErrorAlert
        error={browser.error ? { message: browser.error } : null}
        hasData={browser.episodes.length > 0}
        onRetry={browser.retry}
      />
      {browser.loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", my: 10 }}>
          <CircularProgress aria-label="Loading episodes" />
        </Box>
      ) : (
        <Box
          component={motion.div}
          role="list"
          aria-label="Episodes"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
        >
          {!browser.error && !browser.episodes.length && (
            <Alert severity="info">No episodes in this season.</Alert>
          )}
          {browser.episodes.map((episode) => (
            <EpisodeRow
              key={episode.ratingKey}
              item={episode}
              selecting={selection.active}
              selected={selection.ids.has(episode.ratingKey)}
              onToggle={() => selection.toggle(episode.ratingKey)}
              onStartSelection={() => selection.start(episode.ratingKey)}
              onCancelSelection={selection.clear}
              onSetWatched={(watched) => actions.request(watched, episode)}
            />
          ))}
        </Box>
      )}
    </Box>
  );
}
