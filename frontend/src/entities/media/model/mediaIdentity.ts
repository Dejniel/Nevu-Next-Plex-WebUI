import type { MediaMetadata } from "plex/media";

/** Discover identifies a title; a server ratingKey identifies one local copy. */
export function getPlexTitleIdentity(
  guid: unknown,
): { guid: string; type: "movie" | "show"; id: string } | null {
  if (typeof guid !== "string") return null;
  const match = /^plex:\/\/(movie|show)\/([^\s/?#,]+)$/.exec(guid);
  if (!match || (match[1] !== "movie" && match[1] !== "show")) return null;
  return { guid, type: match[1], id: match[2] };
}

/** Account-owned title data, with no local library, file or watched-state identity. */
export type DiscoverTitle = Pick<
  MediaMetadata,
  | "ratingKey"
  | "title"
  | "titleSort"
  | "year"
  | "thumb"
  | "art"
  | "summary"
  | "duration"
  | "seasonCount"
  | "childCount"
  | "Genre"
  | "Rating"
  | "rating"
  | "ratingImage"
  | "audienceRating"
  | "audienceRatingImage"
  | "addedAt"
> & { type: "movie" | "show"; guid: string };
