import { getPlexTitleIdentity, type MediaItemData } from "entities/media/model";

export function canWatchlist(
  item: Pick<MediaItemData, "type" | "guid">,
): item is { type: "movie" | "show"; guid: string } {
  const identity = getPlexTitleIdentity(item.guid);
  return identity !== null && identity.type === item.type;
}
