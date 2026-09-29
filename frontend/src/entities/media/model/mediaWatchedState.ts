import type { MediaItemData } from "./media";

type WatchedMedia = Pick<
  MediaItemData,
  "type" | "viewCount" | "leafCount" | "viewedLeafCount"
>;

export function isMediaWatched(item: WatchedMedia): boolean {
  if (item.type === "show")
    return Boolean(item.leafCount && item.viewedLeafCount === item.leafCount);
  return (item.viewCount ?? 0) > 0;
}

export function applyMediaWatchedState<T extends WatchedMedia>(
  item: T,
  watched: boolean,
): T {
  return item.type === "show"
    ? { ...item, viewedLeafCount: watched ? item.leafCount : 0 }
    : { ...item, viewCount: watched ? 1 : 0 };
}
