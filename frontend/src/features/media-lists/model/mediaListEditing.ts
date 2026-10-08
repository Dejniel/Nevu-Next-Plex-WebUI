import type { MediaItemData } from "entities/media/model";
import type { MediaListKind, PlaylistType } from "./mediaLists";

export type MediaListItem = Pick<
  MediaItemData,
  "ratingKey" | "title" | "type"
> & {
  librarySectionID?: number;
};
export type MediaListDestination = { id: string } | { title: string };

export interface MediaListCapabilities {
  canAddToCollection: boolean;
  canAddToPlaylist: boolean;
}

export function playlistTypeForItem(type: string): PlaylistType | null {
  if (["artist", "album", "track"].includes(type)) return "audio";
  if (["movie", "show", "season", "episode"].includes(type)) return "video";
  return null;
}

export function getMediaListCapabilities(
  item: MediaListItem,
  context: { localItem: boolean; canManageServer: boolean },
): MediaListCapabilities {
  const localItem = context.localItem && /^\d+$/.test(item.ratingKey);
  return {
    canAddToCollection:
      localItem &&
      context.canManageServer &&
      ["movie", "show"].includes(item.type),
    canAddToPlaylist: localItem && playlistTypeForItem(item.type) !== null,
  };
}

export function assertMediaListItem(kind: MediaListKind, item: MediaListItem) {
  const capabilities = getMediaListCapabilities(item, {
    localItem: true,
    canManageServer: true,
  });
  if (
    !(kind === "collection"
      ? capabilities.canAddToCollection
      : capabilities.canAddToPlaylist)
  )
    throw new Error("This item cannot be added to this list.");
  if (
    kind === "collection" &&
    (!Number.isSafeInteger(item.librarySectionID) ||
      !item.librarySectionID ||
      item.librarySectionID < 0)
  )
    throw new Error(
      "Choose an item from a Plex library to add it to a collection.",
    );
}
