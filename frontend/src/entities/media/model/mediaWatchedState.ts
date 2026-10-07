interface WatchedMedia {
  type: string;
  viewCount?: number;
  leafCount?: number;
  viewedLeafCount?: number;
}

export function isMediaWatched(item: WatchedMedia): boolean {
  if (item.type === "show")
    return Boolean(item.leafCount && item.viewedLeafCount === item.leafCount);
  return (
    ["movie", "season", "episode"].includes(item.type) &&
    (item.viewCount ?? 0) > 0
  );
}

export function applyMediaWatchedState<T extends WatchedMedia>(
  item: T,
  watched: boolean,
): T {
  if (!["movie", "show", "season", "episode"].includes(item.type)) return item;
  return item.type === "show"
    ? { ...item, viewedLeafCount: watched ? item.leafCount : 0 }
    : { ...item, viewCount: watched ? 1 : 0 };
}
