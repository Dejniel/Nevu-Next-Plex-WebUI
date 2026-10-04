export type MediaListKind = "collection" | "playlist";
export const MEDIA_LISTS_CHANGED_EVENT = "nevu:media-lists-changed";

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
}

export function mediaListPath(list: MediaListSummary, libraryID?: string) {
  if (list.kind === "playlist")
    return playlistReturnPath({ id: list.id, index: 0, libraryID });
  return `/browse/${list.libraryID ?? libraryID}?view=collections&list=${list.id}`;
}

export interface MediaListEntry {
  kind: "media";
  item: Plex.Metadata;
  position: number;
  playlistItemID?: string;
  supported: boolean;
}

export type MediaListRecord = MediaListSummary | MediaListEntry;

export interface MediaListQuery {
  kind: MediaListKind;
  libraryID?: string;
  id?: string;
  search?: string;
  sort?: "titleSort:asc" | "titleSort:desc" | "addedAt:desc";
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
  item: Pick<Plex.Metadata, "ratingKey" | "viewOffset"> & {
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
