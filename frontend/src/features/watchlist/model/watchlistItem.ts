import type { MediaItemData } from "entities/media/model";

export function getWatchlistID(guid: unknown) {
  return typeof guid === "string"
    ? (/^plex:\/\/(movie|show)\/([^/?#]+)$/.exec(guid)?.[2] ?? null)
    : null;
}

export function canWatchlist(item: Pick<MediaItemData, "type" | "guid">): item is { type: "movie" | "show"; guid: string } {
  return (
    ["movie", "show"].includes(item.type) && getWatchlistID(item.guid) !== null
  );
}
