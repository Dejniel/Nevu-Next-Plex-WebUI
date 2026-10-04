export type MediaListKind = "collection" | "playlist";

export interface MediaListSummary {
  kind: MediaListKind;
  id: string;
  title: string;
  summary: string;
  image?: string;
  count: number;
  smart: boolean;
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
}

export function parsePlaylistContext(
  params: URLSearchParams,
): PlaylistPlaybackContext | undefined {
  const id = params.get("playlist");
  const position = params.get("position");
  const libraryID = params.get("fromLibrary") ?? undefined;
  if (!id || !/^\d+$/.test(id) || !position || !/^\d+$/.test(position)) return;
  const index = Number(position);
  if (!Number.isSafeInteger(index)) return;
  return {
    id,
    index,
    libraryID: libraryID && /^\d+$/.test(libraryID) ? libraryID : undefined,
  };
}

export function playlistWatchPath(
  item: Pick<Plex.Metadata, "ratingKey" | "viewOffset">,
  context: PlaylistPlaybackContext,
  restart = false,
) {
  const params = new URLSearchParams({
    playlist: context.id,
    position: String(context.index),
  });
  if (context.libraryID) params.set("fromLibrary", context.libraryID);
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
