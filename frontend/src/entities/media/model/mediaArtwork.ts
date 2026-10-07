export type MediaArtworkLayout = "landscape" | "poster" | "square";

export function mediaCardAspectRatio(layout: MediaArtworkLayout) {
  return layout === "poster" ? 2 / 3 : layout === "square" ? 1 : 16 / 9;
}

function firstPath(...paths: Array<string | null | undefined>) {
  return paths.find((path) => typeof path === "string" && path.trim()) || null;
}

export function mediaArtworkPath(
  item: {
    type: string;
    thumb?: string;
    art?: string;
    parentThumb?: string;
    grandparentThumb?: string;
    composite?: string;
  },
  layout: MediaArtworkLayout,
) {
  if (["artist", "album", "track", "photo", "photoalbum"].includes(item.type))
    return firstPath(
      item.thumb,
      item.parentThumb,
      item.grandparentThumb,
      item.composite,
      item.art,
    );
  if (layout === "poster") return firstPath(item.thumb, item.art);
  return item.type === "episode" ? firstPath(item.thumb) : firstPath(item.art);
}
