import { BookmarkBorderRounded, BookmarkRounded } from "@mui/icons-material";
import {
  Button,
  CircularProgress,
  IconButton,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Tooltip,
} from "@mui/material";
import type { MediaItemData } from "entities/media/model";
import React from "react";
import { useBigReader } from "shared/ui";
import { useWatchlistAction } from "../model/watchlistQuery";

function useWatchlistToggle(item: MediaItemData) {
  const { selected, loading, available, toggle: update } = useWatchlistAction(item);

  const toggle = async (event?: React.SyntheticEvent) => {
    event?.preventDefault();
    event?.stopPropagation();
    if (loading || !available) return;

    try {
      await update();
    } catch {
      useBigReader
        .getState()
        .setBigReader(
          "Plex could not update your Watchlist. Please try again.",
        );
    }
  };

  return { loading, selected, toggle, available };
}

export function WatchlistButton({ item }: { item: MediaItemData }) {
  const { loading, selected, toggle, available } = useWatchlistToggle(item);
  if (!available) return null;

  return (
    <Tooltip title={selected ? "Remove from Watchlist" : "Add to Watchlist"}>
      <span>
        <IconButton
          size="small"
          aria-label={selected ? "Remove from watchlist" : "Add to watchlist"}
          sx={{
            backgroundColor: "rgba(18, 25, 39, 0.55)",
            backdropFilter: "blur(12px)",
            border: "1px solid rgba(255,255,255,0.15)",
            color: "#fff",
            width: "30px",
            height: "30px",
            pointerEvents: "auto",
            transition: "background-color 0.2s ease",
            "&:hover": { backgroundColor: "rgba(18, 25, 39, 0.8)" },
          }}
          disabled={loading}
          onClick={toggle}
        >
          {loading ? (
            <CircularProgress size={12} color="inherit" />
          ) : selected ? (
            <BookmarkRounded sx={{ fontSize: "16px" }} />
          ) : (
            <BookmarkBorderRounded sx={{ fontSize: "16px" }} />
          )}
        </IconButton>
      </span>
    </Tooltip>
  );
}

export function HeroWatchlistButton({ item }: { item: Plex.Metadata }) {
  const { loading, selected, toggle, available } = useWatchlistToggle(item);
  if (!available) return null;

  return (
    <Tooltip
      title={selected ? "Remove from Watchlist" : "Add to Watchlist"}
      placement="top"
      arrow
    >
      <span>
        <Button
          variant="contained"
          aria-label={selected ? "Remove from watchlist" : "Add to watchlist"}
          sx={{
            fontWeight: "bold",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            height: "38.5px",
          }}
          disabled={loading}
          onClick={toggle}
        >
          {loading ? (
            <CircularProgress size={16} color="inherit" />
          ) : selected ? (
            <BookmarkRounded fontSize="small" />
          ) : (
            <BookmarkBorderRounded fontSize="small" />
          )}
        </Button>
      </span>
    </Tooltip>
  );
}

export function WatchlistMenuItem({
  item,
  onDone,
  ...menuItemProps
}: {
  item: MediaItemData;
  onDone?: () => void;
  autoFocus?: boolean;
  tabIndex?: number;
}) {
  const { loading, selected, toggle, available } = useWatchlistToggle(item);
  if (!available) return null;

  return (
    <MenuItem
      {...menuItemProps}
      disabled={loading}
      onClick={async (event) => {
        await toggle(event);
        onDone?.();
      }}
    >
      <ListItemIcon>
        {loading ? (
          <CircularProgress size={18} color="inherit" />
        ) : selected ? (
          <BookmarkRounded fontSize="small" />
        ) : (
          <BookmarkBorderRounded fontSize="small" />
        )}
      </ListItemIcon>
      <ListItemText>
        {selected ? "Remove from Watchlist" : "Add to Watchlist"}
      </ListItemText>
    </MenuItem>
  );
}
