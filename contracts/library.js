// Plex search types. Photo albums are Directory/type=photo on the wire,
// but have a distinct search type and a distinct catalog identity.
export const libraryItemTypeNumbers = Object.freeze({
  movie: 1,
  show: 2,
  season: 3,
  episode: 4,
  artist: 8,
  album: 9,
  track: 10,
  clip: 12,
  photo: 13,
  photoalbum: 14,
});

export function isLibraryItemType(value) {
  return (
    typeof value === "string" && Object.hasOwn(libraryItemTypeNumbers, value)
  );
}

export function isVideoLibraryItemType(value) {
  return value === "movie" || value === "show" || value === "season" || value === "episode";
}

export function isLibraryContainerType(value) {
  return (
    value === "show" ||
    value === "season" ||
    value === "artist" ||
    value === "album" ||
    value === "photoalbum"
  );
}

/** Folder IDs belong to the filesystem catalog, never to media metadata. */
export function libraryEntryKey(item) {
  return item.type === "folder" ? `folder:${item.id}` : item.ratingKey;
}

export function normalizeLibraryRecord(item, directory = false, requestedType) {
  return item.type === "photo" &&
    (directory ||
      requestedType === "photoalbum" ||
      (typeof item.key === "string" && /\/children(?:\?|$)/.test(item.key)))
    ? { ...item, type: "photoalbum" }
    : item;
}
