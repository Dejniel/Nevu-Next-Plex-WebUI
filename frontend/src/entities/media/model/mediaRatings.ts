export type MediaRatingKind = "critic" | "audience" | "user" | "rating";

export interface MediaRating {
  value: number;
  source?: string;
  kind: MediaRatingKind;
}

interface RatingMetadata {
  rating?: number;
  audienceRating?: number;
  userRating?: number;
  ratingImage?: string;
  audienceRatingImage?: string;
  Rating?: { value: number; image?: string; type?: string }[];
}

const providerNames: Record<string, string> = {
  imdb: "IMDb",
  tmdb: "TMDB",
  themoviedb: "TMDB",
  rottentomatoes: "Rotten Tomatoes",
  metacritic: "Metacritic",
  plex: "Plex",
};

export function validMediaRating(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 10
  );
}

export function formatMediaRating(value: number) {
  return `${value.toFixed(1)}/10`;
}

function ratingSource(image?: string) {
  const provider = image?.match(/^([^:]+):\/\//)?.[1].toLowerCase();
  if (!provider || provider === "http" || provider === "https")
    return undefined;
  return Object.hasOwn(providerNames, provider)
    ? providerNames[provider]
    : provider;
}

export function mediaRatingLabel({ source, kind }: MediaRating) {
  const label = {
    critic: "Critics",
    audience: "Audience",
    user: "You",
    rating: "Rating",
  }[kind];
  return source ? (kind === "rating" ? source : `${source} · ${label}`) : label;
}

export function getMediaRatings(item: RatingMetadata): MediaRating[] {
  const ratings: MediaRating[] = [];
  const add = (
    value: unknown,
    image: string | undefined,
    kind: MediaRatingKind,
  ) => {
    if (!validMediaRating(value)) return;
    const source = ratingSource(image);
    if (
      ratings.some(
        (rating) =>
          rating.source === source &&
          rating.kind === kind &&
          (source || rating.value === value),
      )
    )
      return;
    ratings.push({ value, source, kind });
  };
  for (const rating of item.Rating ?? []) {
    if (rating.type === "critic" || rating.type === "audience")
      add(rating.value, rating.image, rating.type);
  }
  // Provider entries take precedence over scalar summary scores.
  // Rotten Tomatoes has two distinct scores, even when their values happen to match.
  for (const [value, image, kind] of [
    [item.audienceRating, item.audienceRatingImage, "audience"],
    [
      item.rating,
      item.ratingImage,
      ratingSource(item.ratingImage) === "Rotten Tomatoes"
        ? "critic"
        : "rating",
    ],
  ] as const) {
    const source = ratingSource(image);
    if (
      ratings.some((rating) =>
        source
          ? rating.source === source &&
            (source !== "Rotten Tomatoes" || rating.kind === kind)
          : rating.value === value && rating.kind === kind,
      )
    )
      continue;
    add(value, image, kind);
  }
  if (item.userRating && item.userRating > 0)
    add(item.userRating, undefined, "user");
  return ratings;
}

export function getPrimaryMediaRating(item: RatingMetadata) {
  const ratings = getMediaRatings(item);
  return (
    ratings.find((rating) => rating.kind === "audience") ??
    ratings.find((rating) => rating.kind !== "user")
  );
}
