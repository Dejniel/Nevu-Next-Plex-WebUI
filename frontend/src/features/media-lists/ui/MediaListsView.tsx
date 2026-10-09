import {
  ArrowBackRounded,
  CollectionsBookmarkRounded,
  PlayArrowRounded,
  ShuffleRounded,
  PlaylistPlayRounded,
  PhotoAlbumRounded,
} from "@mui/icons-material";
import {
  Box,
  Button,
  IconButton,
  MenuItem,
  Select,
  TextField,
  Typography,
} from "@mui/material";
import {
  getLibraryCardWidth,
  LibraryBrowseFrame,
  useLibraryCardView,
} from "features/library/public";
import { ActionableMediaCard } from "features/media-actions/public";
import { photoGalleryGeometry } from "features/photos/model";
import { PhotoPlaylistContents } from "./PhotoPlaylistContents";
import { mediaCardAspectRatio } from "entities/media/model";
import { useMusic } from "features/music/model";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Link,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import { CollectionViewport } from "shared/ui/CollectionViewport";
import { useVirtualGrid } from "shared/lib/useVirtualGrid";
import {
  playlistWatchPath,
  playlistPhoto,
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
    (params.get("playlistType") === "photo"
      ? "photo"
      : params.get("playlistType") === "audio"
        ? "audio"
        : "video");
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
  const effectiveType = id
    ? (list.first.data?.summary?.playlistType ?? playlistType)
    : playlistType;
  const audio = kind === "playlist" && effectiveType === "audio";
  const photos = kind === "playlist" && effectiveType === "photo";
  const photoAlbum = photos && Boolean(id);
  const [information, setInformation] = useState(false);
  const trackRows = audio && Boolean(id);
  const cardView = {
    ...savedCardView,
    layout: audio || photos ? ("square" as const) : savedCardView.layout,
  };
  const [selection, setSelection] = useState<{
    key: string;
    action: PlaylistAction;
  } | null>(null);
  const editorKey = `${list.scope.serverId}:${list.scope.profileKey}:${id}`;
  useEffect(() => setSelection(null), [editorKey]);
  const selectPlaylistAction = useCallback(
    (action: PlaylistAction) => {
      if (params.has("photo")) {
        const next = new URLSearchParams(params);
        next.delete("photo");
        next.delete("photoIndex");
        setParams(next, { replace: true });
      }
      setSelection({ key: editorKey, action });
    },
    [editorKey, params, setParams],
  );
  const grid = useVirtualGrid({
    count: list.total,
    minimumCount: list.knownSize + (list.total === null ? 1 : 0),
    ...(trackRows
      ? { layout: "list" as const, itemHeight: 68 }
      : photoAlbum
        ? photoGalleryGeometry(cardView.size, information)
        : {
            itemWidth: getLibraryCardWidth(cardView.layout, cardView.size),
            imageAspectRatio: mediaCardAspectRatio(cardView.layout),
            footerHeight: 94,
          }),
    observeRef: toolbarRef,
    resetKey: list.key,
  });
  const data = useMediaList(list, grid.range);
  const title =
    kind === "collection" ? "Collections" : photos ? "My albums" : "Playlists";
  const setParam = (name: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(name, value);
    else next.delete(name);
    setParams(next, { replace: true });
  };
  const listTarget = (listID?: string) => {
    const next = new URLSearchParams(params);
    if (kind === "playlist" && !libraryPlaylistType)
      next.set("playlistType", effectiveType);
    if (listID) next.set("list", listID);
    else next.delete("list");
    ["mid", "pguid", "detailsTab", "photo", "photoIndex"].forEach((name) =>
      next.delete(name),
    );
    return { pathname: location.pathname, search: `?${next}` };
  };
  const first = data.items.get(0);
  const firstPhoto = first && playlistPhoto(first);
  const photoTarget = new URLSearchParams(params);
  if (firstPhoto) {
    photoTarget.set("photo", firstPhoto.ratingKey);
    photoTarget.set("photoIndex", "0");
  }
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
      showOrientation={!audio && !photos}
      showCardControls={!trackRows}
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
              {photoAlbum && firstPhoto && (
                <Button
                  component={Link}
                  to={{
                    pathname: location.pathname,
                    search: `?${photoTarget}`,
                  }}
                  state={{ photoPreview: true }}
                  preventScrollReset
                  variant="contained"
                  startIcon={<PhotoAlbumRounded />}
                >
                  View album
                </Button>
              )}
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
                {kind === "playlist"
                  ? photos
                    ? "Album order"
                    : "Playlist order"
                  : "Collection order"}
                {data.summary?.smart ? " · Smart" : ""}
              </Typography>
              {kind === "playlist" && data.summary && (
                <PlaylistEditor
                  key={editorKey}
                  playlist={data.summary}
                  total={data.totalSize ?? data.summary.count}
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
                  <MenuItem value="photo">Photo albums</MenuItem>
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
            {data.totalSize === null
              ? data.loading
                ? "Loading…"
                : `${data.items.size}+ items`
              : `${data.totalSize} ${photos ? (id ? "photos" : "albums") : id ? "items" : title.toLowerCase()}`}
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
              {photos
                ? "Photo albums"
                : audio
                  ? "Music playlists"
                  : "Video playlists"}{" "}
              for the active profile. They can contain{" "}
              {photos ? "photos" : "titles"} from several libraries.
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
      {photoAlbum ? (
        <PhotoPlaylistContents
          list={list}
          data={data}
          grid={grid}
          information={information}
          onInformationChange={setInformation}
          onEdit={selectPlaylistAction}
        />
      ) : (
        <CollectionViewport
          grid={grid}
          range={data}
          hasData={data.hasData}
          itemKey={(record) =>
            record.kind === "media"
              ? `${record.position}:${record.playlistItemID ?? record.item.ratingKey}`
              : record.id
          }
          emptyMessage={
            <>
              {photos ? (
                <PhotoAlbumRounded
                  sx={{ fontSize: 72, color: "text.secondary" }}
                />
              ) : kind === "playlist" ? (
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
                    : photos
                      ? "No albums yet"
                      : `No ${title.toLowerCase()} yet`}
              </Typography>
              <Typography sx={{ color: "text.secondary" }}>
                {search && !id
                  ? "Try a different search."
                  : id
                    ? "Items added in Plex will appear here."
                    : kind === "collection"
                      ? "Collections created in this Plex library will appear here."
                      : photos
                        ? "Create an album from a photo’s menu with Add to album…"
                        : `Your Plex ${audio ? "music" : "video"} playlists will appear here. Add an item to a playlist from its menu.`}
              </Typography>
            </>
          }
          renderItem={(record, _index, imageSizes) => {
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
                  onPlay={record.item.type === "track" ? playAudio : undefined}
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
                  <Typography variant="body2" sx={{ color: "text.secondary" }}>
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
      )}
    </LibraryBrowseFrame>
  );
}
