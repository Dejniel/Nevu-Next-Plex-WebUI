import {
  ArrowBackRounded,
  CollectionsBookmarkRounded,
  PlayArrowRounded,
  PlaylistPlayRounded,
} from "@mui/icons-material";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  IconButton,
  MenuItem,
  Select,
  Skeleton,
  TextField,
  Typography,
} from "@mui/material";
import {
  getLibraryCardWidth,
  LibraryBrowseFrame,
  useLibraryCardView,
} from "features/library/public";
import { ActionableMediaCard } from "features/media-actions/public";
import React, { useRef } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import VirtualGrid from "shared/ui/VirtualGrid";
import {
  playlistWatchPath,
  type MediaListKind,
  type MediaListQuery,
} from "../model/mediaLists";
import { useMediaList } from "../model/useMediaList";
import MediaListCard from "./MediaListCard";

export default function MediaListsView({
  kind,
  libraryID,
  pageNavigation,
}: {
  kind: MediaListKind;
  libraryID?: string;
  pageNavigation?: React.ReactNode;
}) {
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const id = params.get("list") || undefined;
  const search = params.get("listSearch") ?? "";
  const requestedSort = params.get("listSort");
  const sort: MediaListQuery["sort"] =
    requestedSort === "titleSort:desc" || requestedSort === "addedAt:desc"
      ? requestedSort
      : "titleSort:asc";
  const data = useMediaList({
    kind,
    libraryID,
    id,
    search: id ? undefined : search,
    sort: id ? undefined : sort,
  });
  const cardView = useLibraryCardView();
  const toolbarRef = useRef<HTMLDivElement>(null);
  const title = kind === "collection" ? "Collections" : "Playlists";
  const setParam = (name: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(name, value);
    else next.delete(name);
    setParams(next, { replace: true });
  };
  const listTarget = (listID?: string) => {
    const next = new URLSearchParams(params);
    if (listID) next.set("list", listID);
    else next.delete("list");
    ["mid", "pguid", "detailsTab"].forEach((name) => next.delete(name));
    return { pathname: location.pathname, search: `?${next}` };
  };
  const first = data.items.get(0);
  const playlistStart =
    kind === "playlist" &&
    id &&
    first?.kind === "media" &&
    first.supported &&
    ["movie", "episode"].includes(first.item.type)
      ? playlistWatchPath(first.item, { id, index: 0, libraryID }, true)
      : null;

  return (
    <LibraryBrowseFrame
      toolbarRef={toolbarRef}
      cardView={cardView}
      leading={
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            minWidth: 0,
            maxWidth: { lg: 320 },
          }}
        >
          {id && (
            <IconButton
              component={Link}
              to={listTarget()}
              aria-label={`Back to ${title.toLowerCase()}`}
            >
              <ArrowBackRounded />
            </IconButton>
          )}
          <Typography
            component="h1"
            variant="h6"
            sx={{ overflowWrap: "anywhere" }}
          >
            {data.summary?.title ?? title}
          </Typography>
        </Box>
      }
      pageNavigation={pageNavigation}
      filters={
        <>
          {id ? (
            <>
              {playlistStart && (
                <Button
                  component={Link}
                  to={playlistStart}
                  startIcon={<PlayArrowRounded />}
                  variant="contained"
                >
                  Play playlist
                </Button>
              )}
              <Typography variant="body2" sx={{ color: "text.secondary" }}>
                {kind === "playlist" ? "Playlist order" : "Collection order"}
                {data.summary?.smart ? " · Smart" : ""}
              </Typography>
            </>
          ) : (
            <>
              <TextField
                size="small"
                label={`Search ${title.toLowerCase()}`}
                value={search}
                onChange={(event) => setParam("listSearch", event.target.value)}
                sx={{ flex: "1 1 160px", maxWidth: 320 }}
              />
              <Select
                size="small"
                value={sort}
                inputProps={{ "aria-label": `Sort ${title.toLowerCase()}` }}
                onChange={(event) => setParam("listSort", event.target.value)}
                sx={{ minWidth: 155 }}
              >
                <MenuItem value="titleSort:asc">Title (A–Z)</MenuItem>
                <MenuItem value="titleSort:desc">Title (Z–A)</MenuItem>
                <MenuItem value="addedAt:desc">Recently added</MenuItem>
              </Select>
            </>
          )}
          <Typography variant="body2" role="status" sx={{ color: "text.secondary", ml: "auto" }}>
            {data.total === null
              ? data.loading
                ? "Loading…"
                : `${data.items.size}+ items`
              : `${data.total} ${id ? "items" : title.toLowerCase()}`}
          </Typography>
        </>
      }
      description={
        <>
          {kind === "playlist" && !id && (
            <Typography
              variant="body2"
              sx={{ color: "text.secondary", px: { xs: 1, md: 6 }, pb: 1 }}
            >
              Video playlists for the active profile. They can contain titles
              from several libraries.
            </Typography>
          )}
          {data.summary?.summary && (
            <Typography sx={{ color: "text.secondary", px: { xs: 1, md: 6 }, py: 1 }}>
              {data.summary.summary}
            </Typography>
          )}
        </>
      }
    >
      {data.error && (
        <Alert
          severity="error"
          sx={{ mb: 2 }}
          action={
            <Button color="inherit" onClick={data.retry}>
              Retry
            </Button>
          }
        >
          {data.error}
        </Alert>
      )}
      {data.loading ? (
        <Box sx={{ minHeight: 220, display: "grid", placeItems: "center" }}>
          <CircularProgress aria-label={`Loading ${title.toLowerCase()}`} />
        </Box>
      ) : data.total === 0 ? (
        <Box
          sx={{
            minHeight: 280,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            gap: 1,
          }}
        >
          {kind === "playlist" ? (
            <PlaylistPlayRounded
              sx={{ fontSize: 72, color: "text.secondary" }}
            />
          ) : (
            <CollectionsBookmarkRounded
              sx={{ fontSize: 72, color: "text.secondary" }}
            />
          )}
          <Typography variant="h5">
            {id
              ? "This list is empty"
              : search
                ? "No matching lists"
                : `No ${title.toLowerCase()} yet`}
          </Typography>
          <Typography sx={{ color: "text.secondary" }}>
            {search && !id
              ? "Try a different search."
              : id
                ? "Items added in Plex will appear here."
                : kind === "collection"
                  ? "Collections created in this Plex library will appear here."
                  : "Your Plex video playlists will appear here."}
          </Typography>
        </Box>
      ) : (
        data.items.size > 0 && (
          <VirtualGrid
            key={data.key}
            count={data.total}
            minimumCount={data.knownSize + (data.total === null ? 1 : 0)}
            itemWidth={getLibraryCardWidth(cardView.layout, cardView.size)}
            imageAspectRatio={cardView.layout === "poster" ? 2 / 3 : 16 / 9}
            footerHeight={94}
            observeRef={toolbarRef}
            resetKey={data.key}
            onRangeChange={data.requestRange}
            itemKey={(index) => {
              const record = data.items.get(index);
              return record?.kind === "media"
                ? `${index}:${record.playlistItemID ?? record.item.ratingKey}`
                : (record?.id ?? index);
            }}
            renderItem={(index, imageSizes) => {
              const record = data.items.get(index);
              if (!record)
                return (
                  <Skeleton
                    variant="rounded"
                    sx={{
                      aspectRatio:
                        cardView.layout === "poster" ? "2/3" : "16/9",
                    }}
                  />
                );
              if (record.kind !== "media")
                return (
                  <MediaListCard
                    list={record}
                    to={listTarget(record.id)}
                    layout={cardView.layout}
                    imageSizes={imageSizes}
                  />
                );
              if (!record.supported)
                return (
                  <Box sx={{ p: 2, bgcolor: "action.hover", borderRadius: 1 }}>
                    <Typography>{record.item.title}</Typography>
                    <Typography variant="body2" sx={{ color: "text.secondary" }}>
                      This item cannot be opened on this server.
                    </Typography>
                  </Box>
                );
              return (
                <>
                  <ActionableMediaCard
                    item={record.item}
                    layout={cardView.layout}
                    imageSizes={imageSizes}
                    imageLoading="eager"
                    playbackTo={
                      kind === "playlist" &&
                      id &&
                      ["movie", "episode"].includes(record.item.type)
                        ? playlistWatchPath(record.item, {
                            id,
                            index: record.position,
                            libraryID,
                          })
                        : undefined
                    }
                  />
                  {kind === "playlist" && (
                    <Typography variant="caption" sx={{ color: "text.secondary" }}>
                      {index + 1}
                    </Typography>
                  )}
                </>
              );
            }}
          />
        )
      )}
    </LibraryBrowseFrame>
  );
}
