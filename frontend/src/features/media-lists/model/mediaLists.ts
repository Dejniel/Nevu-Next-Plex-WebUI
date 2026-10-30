import type { MediaMetadata } from "entities/media/model";
export type MediaListKind = "collection" | "playlist";
export type PlaylistType = "video" | "audio" | "photo";

export interface MediaListSummary {
  kind: MediaListKind;
  id: string;
  title: string;
  summary: string;
  image?: string;
  count: number;
  smart: boolean;
  libraryID?: string;
  itemType?: string;
  playlistType?: PlaylistType;
}

export function mediaListPath(list: MediaListSummary, libraryID?: string) {
  if (list.kind === "playlist")
    return playlistReturnPath({ id: list.id, index: 0, libraryID });
  return `/browse/${list.libraryID ?? libraryID}?view=collections&list=${list.id}`;
}

interface MediaListOccurrence {
  kind: "media";
  position: number;
  playlistItemID?: string;
}

export type MediaListEntry = MediaListOccurrence &
  (
    | { supported: true; item: MediaMetadata }
    | {
        supported: false;
        item: { ratingKey: string; type: string; title: string };
      }
  );

export type MediaListRecord = MediaListSummary | MediaListEntry;

export interface MediaListQuery {
  kind: MediaListKind;
  libraryID?: string;
  id?: string;
  search?: string;
  sort?: "titleSort:asc" | "titleSort:desc" | "addedAt:desc";
  playlistType?: PlaylistType;
}

export interface MediaListPage {
  offset: number;
  total: number | null;
  items: MediaListRecord[];
}

export interface PlaylistPlaybackContext {
  id: string;
  index: number;
  libraryID?: string;
  itemID?: string;
}

export function parsePlaylistContext(
  params: URLSearchParams,
): PlaylistPlaybackContext | undefined {
  const id = params.get("playlist");
  const position = params.get("position");
  const libraryID = params.get("fromLibrary") ?? undefined;
  const itemID = params.get("playlistItem") ?? undefined;
  if (!id || !/^\d+$/.test(id) || !position || !/^\d+$/.test(position)) return;
  const index = Number(position);
  if (!Number.isSafeInteger(index)) return;
  if (itemID && !/^\d+$/.test(itemID)) return;
  return {
    id,
    index,
    libraryID: libraryID && /^\d+$/.test(libraryID) ? libraryID : undefined,
    itemID,
  };
}

export function playlistWatchPath(
  item: Pick<MediaMetadata, "ratingKey" | "viewOffset"> & {
    playlistItemID?: number | string;
  },
  context: PlaylistPlaybackContext,
  restart = false,
) {
  const params = new URLSearchParams({
    playlist: context.id,
    position: String(context.index),
  });
  if (context.libraryID) params.set("fromLibrary", context.libraryID);
  const itemID = item.playlistItemID ?? context.itemID;
  if (itemID !== undefined) params.set("playlistItem", String(itemID));
  if (restart) params.set("t", "0");
  else if (item.viewOffset) params.set("t", String(item.viewOffset));
  return `/watch/${item.ratingKey}?${params}`;
}

export function playlistReturnPath(context: PlaylistPlaybackContext) {
  const params = new URLSearchParams({ list: context.id });
  if (!context.libraryID) return `/playlists?${params}`;
  params.set("view", "playlists");
  return `/browse/${context.libraryID}?${params}`;
}

export function playlistPhoto(record: MediaListRecord) {
  return record.kind === "media" &&
    record.supported &&
    record.item.type === "photo"
    ? record.item
    : undefined;
}

export function validateListWindow(
  pages: readonly MediaListPage[],
  kind: MediaListQuery["kind"],
) {
  const total = pages.find((page) => page.total !== null)?.total;
  const ids = new Set<string>();
  for (const page of pages) {
    if (page.total !== null && total !== undefined && page.total !== total)
      throw new Error("The list changed while loading. Please try again.");
    page.items.forEach((record, index) => {
      if (record.kind === "media" && record.position !== page.offset + index)
        throw new Error("Plex returned inconsistent playlist positions.");
      const id =
        record.kind !== "media"
          ? record.id
          : kind === "playlist"
            ? record.playlistItemID
            : record.item.ratingKey;
      if (id !== undefined && ids.has(id))
        throw new Error("The list changed while loading. Please try again.");
      if (id !== undefined) ids.add(id);
    });
  }
}
