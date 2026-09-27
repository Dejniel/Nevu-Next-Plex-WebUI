export type MediaArtworkLayout = "landscape" | "poster";

function firstPath(...paths: Array<string | null | undefined>) {
  return paths.find((path) => typeof path === "string" && path.trim()) || null;
}

export function mediaArtworkPath(
  item: { type: string; thumb?: string; art?: string },
  layout: MediaArtworkLayout,
) {
  if (layout === "poster") return firstPath(item.thumb, item.art);
  return item.type === "episode" ? firstPath(item.thumb) : firstPath(item.art);
}
