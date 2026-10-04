import { BookmarkBorderRounded, BookmarkRounded } from "@mui/icons-material";
import {
  Button,
  CircularProgress,
  IconButton,
  ListItemIcon,
  ListItemText,
  MenuItem,
} from "@mui/material";
import type { MediaItemData } from "entities/media/model";
import React from "react";
import { useBigReader } from "shared/ui";
import { useWatchlist } from "../model/watchlistStore";

function useWatchlistToggle(item: MediaItemData) {
  const selected = useWatchlist((state) => state.has(item.guid));
  const add = useWatchlist((state) => state.add);
  const remove = useWatchlist((state) => state.remove);
  const [loading, setLoading] = React.useState(false);

  const toggle = async (event?: React.SyntheticEvent) => {
    event?.preventDefault();
    event?.stopPropagation();
    if (loading) return;

    setLoading(true);
    try {
      if (selected) await remove(item.guid);
      else await add(item as Plex.Metadata);
    } catch {
      useBigReader
        .getState()
        .setBigReader(
          "Plex could not update your Watchlist. Please try again.",
        );
    } finally {
      setLoading(false);
    }
  };

  return { loading, selected, toggle };
}

export function WatchlistButton({ item }: { item: MediaItemData }) {
  const { loading, selected, toggle } = useWatchlistToggle(item);

  return (
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
  );
}

export function HeroWatchlistButton({ item }: { item: Plex.Metadata }) {
  const { loading, selected, toggle } = useWatchlistToggle(item);

  return (
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
  );
}

export function WatchlistMenuItem({
  item,
  onDone,
}: {
  item: MediaItemData;
  onDone?: () => void;
}) {
  const { loading, selected, toggle } = useWatchlistToggle(item);

  return (
    <MenuItem
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
