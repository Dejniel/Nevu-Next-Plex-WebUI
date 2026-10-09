export type LibraryView =
  | "recommendations"
  | "browse"
  | "photos"
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
const musicViews: readonly LibraryView[] = ["browse", "playlists"];
const photoViews: readonly LibraryView[] = ["browse", "photos", "playlists"];

export function isBrowsableLibraryType(type: string) {
  return ["movie", "show", "artist", "photo"].includes(type);
}

export function libraryViews(type: string | undefined): readonly LibraryView[] {
  return type === "movie" || type === "show"
    ? videoViews
    : type === "artist"
      ? musicViews
      : type === "photo"
        ? photoViews
        : catalogViews;
}
