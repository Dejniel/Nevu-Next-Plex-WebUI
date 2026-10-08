import {
  ArrowBackRounded,
  CollectionsBookmarkRounded,
  PlayArrowRounded,
  ShuffleRounded,
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
import { mediaCardAspectRatio } from "entities/media/model";
import { useMusic } from "features/music/model";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Link,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import VirtualGrid from "shared/ui/VirtualGrid";
import { useVirtualGrid } from "shared/lib/useVirtualGrid";
import {
  playlistWatchPath,
  type MediaListKind,
  type MediaListQuery,
  type PlaylistType,
} from "../model/mediaLists";
import { useMediaList, useMediaListWindow } from "../model/useMediaList";
import MediaListCard from "./MediaListCard";
import PlaylistEntryCard from "./PlaylistEntryCard";
import PlaylistEditor, { type PlaylistAction } from "./PlaylistEditor";

export default function MediaListsView({
  kind,
  libraryID,
  pageNavigation,
  playlistType: libraryPlaylistType,
}: {
  kind: MediaListKind;
  libraryID?: string;
  pageNavigation?: React.ReactNode;
  playlistType?: PlaylistType;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const id = params.get("list") || undefined;
  const playlistType =
    libraryPlaylistType ??
    (params.get("playlistType") === "audio" ? "audio" : "video");
  const { busy: musicBusy, playPlaylist } = useMusic();
  const search = params.get("listSearch") ?? "";
  const requestedSort = params.get("listSort");
  const sort: MediaListQuery["sort"] =
    requestedSort === "titleSort:desc" || requestedSort === "addedAt:desc"
      ? requestedSort
      : "titleSort:asc";
  const query: MediaListQuery = {
    kind,
    libraryID,
    id,
    search: id ? undefined : search,
    sort: id ? undefined : sort,
    playlistType,
  };
  const savedCardView = useLibraryCardView();
  const toolbarRef = useRef<HTMLDivElement>(null);
  const list = useMediaListWindow(query);
  const audio =
    kind === "playlist" &&
    (id
      ? list.first.data?.summary?.playlistType === "audio"
      : playlistType === "audio");
  const trackRows = audio && Boolean(id);
  const cardView = {
    ...savedCardView,
    layout: audio ? ("square" as const) : savedCardView.layout,
  };
  const [selection, setSelection] = useState<{
    key: string;
    action: PlaylistAction;
  } | null>(null);
  const editorKey = `${list.scope.serverId}:${list.scope.profileKey}:${id}`;
  useEffect(() => setSelection(null), [editorKey]);
  const selectPlaylistAction = useCallback(
    (action: PlaylistAction) => setSelection({ key: editorKey, action }),
    [editorKey],
  );
  const grid = useVirtualGrid({
    count: list.total,
    minimumCount: list.knownSize + (list.total === null ? 1 : 0),
    itemWidth: trackRows
      ? 1_000_000
      : getLibraryCardWidth(cardView.layout, cardView.size),
    imageAspectRatio: trackRows
      ? Infinity
      : mediaCardAspectRatio(cardView.layout),
    footerHeight: trackRows ? 68 : 94,
    observeRef: toolbarRef,
    resetKey: list.key,
  });
  const data = useMediaList(list, grid.range);
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
  const audioStart =
    kind === "playlist" &&
    id &&
    first?.kind === "media" &&
    first.supported &&
    first.item.type === "track"
      ? first
      : null;
  const playAudio = useCallback(
    (entry: NonNullable<typeof audioStart>, shuffle = false) => {
      if (id)
        void playPlaylist(
          {
            id,
            index: entry.position,
            libraryID,
            itemID: entry.playlistItemID,
          },
          entry.item,
          shuffle,
        );
    },
    [id, libraryID, playPlaylist],
  );

  return (
    <LibraryBrowseFrame
      toolbarRef={toolbarRef}
      cardView={cardView}
      showOrientation={!audio}
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
              {audioStart && (
                <>
                  <Button
                    onClick={() => playAudio(audioStart)}
                    disabled={musicBusy}
                    startIcon={<PlayArrowRounded />}
                    variant="contained"
                  >
                    Play playlist
                  </Button>
                  <Button
                    onClick={() => playAudio(audioStart, true)}
                    disabled={musicBusy}
                    startIcon={<ShuffleRounded />}
                  >
                    Shuffle
                  </Button>
                </>
              )}
              <Typography variant="body2" sx={{ color: "text.secondary" }}>
                {kind === "playlist" ? "Playlist order" : "Collection order"}
                {data.summary?.smart ? " · Smart" : ""}
              </Typography>
              {kind === "playlist" && data.summary && (
                <PlaylistEditor
                  key={editorKey}
                  playlist={data.summary}
                  total={data.total ?? data.summary.count}
                  scope={list.scope}
                  selected={
                    selection?.key === editorKey ? selection.action : null
                  }
                  onSelect={selectPlaylistAction}
                  onClose={() => setSelection(null)}
                  onDeleted={() => navigate(listTarget(), { replace: true })}
                />
              )}
            </>
          ) : (
            <>
              {kind === "playlist" && !libraryPlaylistType && (
                <Select
                  size="small"
                  value={playlistType}
                  inputProps={{ "aria-label": "Playlist type" }}
                  onChange={(event) =>
                    setParam("playlistType", event.target.value)
                  }
                >
                  <MenuItem value="video">Video playlists</MenuItem>
                  <MenuItem value="audio">Music playlists</MenuItem>
                </Select>
              )}
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
          <Typography
            variant="body2"
            role="status"
            sx={{ color: "text.secondary", ml: "auto" }}
          >
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
              {audio ? "Music" : "Video"} playlists for the active profile. They
              can contain titles from several libraries.
            </Typography>
          )}
          {data.summary?.summary && (
            <Typography
              sx={{
                color: "text.secondary",
                px: { xs: 1, md: 6 },
                py: 1,
                whiteSpace: "pre-line",
                overflowWrap: "anywhere",
              }}
            >
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
                  : `Your Plex ${audio ? "music" : "video"} playlists will appear here. Add an item to a playlist from its menu.`}
          </Typography>
        </Box>
      ) : (
        Boolean(list.first.data?.items.length) && (
          <VirtualGrid
            grid={grid}
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
                      aspectRatio: trackRows
                        ? undefined
                        : mediaCardAspectRatio(cardView.layout),
                      height: trackRows ? 68 : undefined,
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
              if (kind === "playlist" && id)
                return (
                  <PlaylistEntryCard
                    entry={record}
                    layout={cardView.layout}
                    imageSizes={imageSizes}
                    editable={data.summary?.smart === false}
                    onEdit={selectPlaylistAction}
                    onPlay={
                      record.item.type === "track" ? playAudio : undefined
                    }
                    playbackTo={
                      ["movie", "episode"].includes(record.item.type)
                        ? playlistWatchPath(record.item, {
                            id,
                            index: record.position,
                            libraryID,
                          })
                        : undefined
                    }
                  />
                );
              if (!record.supported)
                return (
                  <Box sx={{ p: 2, bgcolor: "action.hover", borderRadius: 1 }}>
                    <Typography>{record.item.title}</Typography>
                    <Typography
                      variant="body2"
                      sx={{ color: "text.secondary" }}
                    >
                      This item cannot be opened on this server.
                    </Typography>
                  </Box>
                );
              return (
                <ActionableMediaCard
                  item={record.item}
                  layout={cardView.layout}
                  imageSizes={imageSizes}
                  imageLoading="eager"
                />
              );
            }}
          />
        )
      )}
    </LibraryBrowseFrame>
  );
}
