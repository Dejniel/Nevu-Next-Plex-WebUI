import type { MediaItemData } from "entities/media/model";

export function getWatchlistID(guid: string) {
  return typeof guid === "string"
    ? (/^plex:\/\/(movie|show)\/([^/?#]+)$/.exec(guid)?.[2] ?? null)
    : null;
}

export function canWatchlist(item: Pick<MediaItemData, "type" | "guid">) {
  return (
    ["movie", "show"].includes(item.type) && getWatchlistID(item.guid) !== null
  );
}
