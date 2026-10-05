import { BookmarkBorderRounded } from "@mui/icons-material";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  FormControlLabel,
  MenuItem,
  Select,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { useLibraries } from "entities/library/model";
import { selectLocalMedia, useMediaAvailability } from "entities/media/model";
import {
  getLibraryCardWidth,
  LibraryBrowseFrame,
  useLibraryCardView,
} from "features/library/public";
import { ActionableMediaCard } from "features/media-actions/public";
import { useUserSettings } from "features/settings/model";
import React, { useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import VirtualGrid from "shared/ui/VirtualGrid";
import { useAutoRefresh } from "shared/lib/useAutoRefresh";
import {
  selectWatchlistItems,
  type WatchlistSort,
} from "../model/watchlistBrowse";
import { useWatchlist } from "../model/watchlistStore";

export default function WatchlistView({
  libraryID,
  pageNavigation,
}: {
  libraryID?: string;
  pageNavigation?: React.ReactNode;
}) {
  const { items, status, hasLoaded, error, load } = useWatchlist();
  const profileKey = useUserSettings((state) => state.profileKey);
  const libraries = useLibraries((state) => state.libraries);
  const availability = useMediaAvailability(
    items.map((item) => item.guid),
    profileKey,
  );
  useAutoRefresh(profileKey, () => load());
  const cardView = useLibraryCardView();
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [params, setParams] = useSearchParams();
  const libraryOnly = Boolean(libraryID) && params.get("wlScope") !== "all";
  const search = params.get("wlSearch") ?? "";
  const requestedSort = params.get("wlSort");
  const sort: WatchlistSort =
    requestedSort === "title" || requestedSort === "year"
      ? requestedSort
      : "added";
  const setParam = (name: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(name, value);
    else next.delete(name);
    setParams(next, { replace: true });
  };
  const selected = useMemo(
    () =>
      selectWatchlistItems(items, availability.items, {
        libraryID: libraryOnly ? libraryID : undefined,
        search,
        sort,
      }),
    [availability.items, items, libraryID, libraryOnly, search, sort],
  );
  const waiting =
    (!hasLoaded &&
      items.length === 0 &&
      (status === "idle" || status === "loading")) ||
    (libraryOnly && availability.loading);
  const unavailableScope = libraryOnly && Boolean(availability.error);

  useEffect(() => {
    if (profileKey) void load(30_000);
  }, [load, profileKey]);

  return (
    <LibraryBrowseFrame
      toolbarRef={toolbarRef}
      cardView={cardView}
      leading={
        <Typography component="h1" variant="h6">
          Watchlist
        </Typography>
      }
      pageNavigation={pageNavigation}
      filters={
        <>
          {libraryID && (
            <FormControlLabel
              control={
                <Switch
                  checked={libraryOnly}
                  onChange={(_, checked) =>
                    setParam("wlScope", checked ? "library" : "all")
                  }
                />
              }
              label="Only this library"
              sx={{ mr: { xs: 0, sm: 2 } }}
            />
          )}
          <TextField
            size="small"
            label="Search Watchlist"
            value={search}
            onChange={(event) => setParam("wlSearch", event.target.value)}
            sx={{ flex: "1 1 160px", maxWidth: 320 }}
          />
          <Select
            size="small"
            value={sort}
            inputProps={{ "aria-label": "Sort Watchlist" }}
            onChange={(event) => setParam("wlSort", event.target.value)}
            sx={{ minWidth: 155 }}
          >
            <MenuItem value="added">Watchlist order</MenuItem>
            <MenuItem value="title">Title</MenuItem>
            <MenuItem value="year">Newest releases</MenuItem>
          </Select>
          <Typography variant="body2" role="status" sx={{ color: "text.secondary", ml: "auto" }}>
            {unavailableScope
              ? "Availability unknown"
              : waiting
                ? "Checking titles…"
                : `${selected.length} ${selected.length === 1 ? "title" : "titles"}`}
          </Typography>
        </>
      }
    >
      {error && (
        <Alert
          severity="error"
          sx={{ mb: 2 }}
          action={
            <Button color="inherit" onClick={() => void load()}>
              Retry
            </Button>
          }
        >
          {error}
        </Alert>
      )}
      {availability.error && (
        <Alert
          severity="warning"
          sx={{ mb: 2 }}
          action={
            <Button color="inherit" onClick={availability.retry}>
              Retry
            </Button>
          }
        >
          {availability.error}
        </Alert>
      )}
      {waiting ? (
        <Box sx={{ minHeight: 220, display: "grid", placeItems: "center" }}>
          <CircularProgress aria-label="Loading Watchlist" />
        </Box>
      ) : selected.length > 0 ? (
        <VirtualGrid
          count={selected.length}
          itemWidth={getLibraryCardWidth(cardView.layout, cardView.size)}
          imageAspectRatio={cardView.layout === "poster" ? 2 / 3 : 16 / 9}
          footerHeight={94}
          observeRef={toolbarRef}
          resetKey={`${libraryID ?? "all"}:${libraryOnly}:${search}:${sort}`}
          itemKey={(index) => selected[index].guid}
          renderItem={(index, imageSizes) => {
            const remote = selected[index];
            const local = selectLocalMedia(
              remote,
              availability.items,
              libraryID,
            );
            const known = !availability.loading && !availability.error;
            const copies =
              availability.items.get(remote.guid)?.localItems ?? [];
            const names = [
              ...new Set(
                copies.map(
                  (copy) =>
                    libraries?.find(
                      (library) =>
                        String(library.key) === String(copy.librarySectionID),
                    )?.title ?? `Library ${copy.librarySectionID}`,
                ),
              ),
            ];
            const label = !known
              ? availability.error
                ? "Availability unknown"
                : "Checking availability…"
              : names.length
                ? names.join(" · ")
                : "Unavailable on this server";
            return (
              <>
                <ActionableMediaCard
                  item={local ?? remote}
                  PlexTvSource={!local}
                  canPlay={Boolean(local) && known}
                  layout={cardView.layout}
                  imageSizes={imageSizes}
                  imageLoading="eager"
                  refetchData={availability.retry}
                />
                <Tooltip title={label}>
                  <Typography
                    variant="caption"
                    noWrap
                    sx={{ color: "text.secondary", display: "block", mt: 0.5 }}
                  >
                    {label}
                  </Typography>
                </Tooltip>
              </>
            );
          }}
        />
      ) : !error && !unavailableScope ? (
        <Box sx={{ textAlign: "center", py: 8, color: "text.secondary" }}>
          <BookmarkBorderRounded sx={{ fontSize: 56, mb: 2 }} />
          <Typography variant="h6" sx={{ color: "text.primary" }}>
            {search
              ? "No matching titles"
              : libraryOnly && items.length
                ? "No Watchlist titles in this library"
                : "Your Watchlist is empty"}
          </Typography>
          <Typography sx={{ mt: 1 }}>
            {search
              ? "Try another title or clear the search."
              : libraryOnly && items.length
                ? "Turn off the library filter to see your full Watchlist."
                : "Save films and shows with the bookmark button to find them here."}
          </Typography>
        </Box>
      ) : null}
    </LibraryBrowseFrame>
  );
}
