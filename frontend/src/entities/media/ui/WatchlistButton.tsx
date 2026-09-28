import { BookmarkBorderRounded, BookmarkRounded } from "@mui/icons-material";
import { Button, CircularProgress, IconButton } from "@mui/material";
import React from "react";
import {
  useWatchListCache,
  WatchListCacheEmitter,
} from "states/WatchListCache";
import type { MediaItemData } from "../model/media";

function useWatchlistToggle(item: MediaItemData) {
  const watchlist = useWatchListCache();
  const [loading, setLoading] = React.useState(false);
  const selected = watchlist.isOnWatchList(item.guid);

  const toggle = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (loading) return;

    setLoading(true);
    WatchListCacheEmitter.once("watchListUpdate", () => setLoading(false));

    if (selected) watchlist.removeItem(item.guid);
    else watchlist.addItem(item as Plex.Metadata);
  };

  return { loading, selected, toggle };
}

export function WatchListButton({ item }: { item: MediaItemData }) {
  const { loading, selected, toggle } = useWatchlistToggle(item);

  return (
    <IconButton
      size="small"
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

export function HeroWatchListButton({ item }: { item: Plex.Metadata }) {
  const { loading, selected, toggle } = useWatchlistToggle(item);

  return (
    <Button
      variant="contained"
      sx={{
        fontWeight: "bold",
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        transition: "all 0.2s ease-in-out",
        height: "38.5px",
      }}
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
