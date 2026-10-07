export type LibraryView =
  | "recommendations"
  | "browse"
  | "watchlist"
  | "collections"
  | "playlists";

const videoViews: readonly LibraryView[] = [
  "recommendations",
  "browse",
  "watchlist",
  "collections",
  "playlists",
];
const catalogViews: readonly LibraryView[] = ["browse"];

export function isBrowsableLibraryType(type: string) {
  return ["movie", "show", "artist", "photo"].includes(type);
}

export function libraryViews(type: string | undefined): readonly LibraryView[] {
  return type === "movie" || type === "show" ? videoViews : catalogViews;
}
