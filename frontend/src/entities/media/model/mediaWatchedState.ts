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
