import {
  formatMediaRating,
  getMediaRatings,
  getPrimaryMediaRating,
  mediaRatingLabel,
} from "./mediaRatings";

it("uses Plex's 0–10 values without converting providers into a new aggregate", () => {
  const ratings = getMediaRatings({
    rating: 8.7,
    ratingImage: "rottentomatoes://image.rating.ripe",
    audienceRating: 9.2,
    audienceRatingImage: "rottentomatoes://image.rating.upright",
    userRating: 6,
  });
  expect(ratings).toEqual([
    { value: 9.2, kind: "audience", source: "Rotten Tomatoes" },
    { value: 8.7, kind: "critic", source: "Rotten Tomatoes" },
    { value: 6, kind: "user", source: undefined },
  ]);
  expect(ratings.map(mediaRatingLabel)).toEqual([
    "Rotten Tomatoes · Audience",
    "Rotten Tomatoes · Critics",
    "You",
  ]);
  expect(ratings.map((rating) => formatMediaRating(rating.value))).toEqual([
    "9.2/10",
    "8.7/10",
    "6.0/10",
  ]);
});

it("prefers detailed ratings and shows each provider once, preserving distinct Rotten Tomatoes categories", () => {
  const item = {
    rating: 9,
    ratingImage: "imdb://image.rating",
    audienceRating: 8,
    audienceRatingImage: "rottentomatoes://image.rating.upright",
    Rating: [
      { value: 8, type: "audience", image: "imdb://image.rating" },
      { value: 8.1, type: "audience", image: "imdb://image.rating" },
      { value: 7.5, type: "audience", image: "themoviedb://image.rating" },
      { value: 8, type: "critic", image: "rottentomatoes://image.rating.ripe" },
      {
        value: 8,
        type: "audience",
        image: "rottentomatoes://image.rating.upright",
      },
    ],
  };
  const ratings = getMediaRatings(item);
  expect(ratings).toHaveLength(4);
  expect(ratings.filter((rating) => rating.source === "IMDb")).toEqual([
    { value: 8, kind: "audience", source: "IMDb" },
  ]);
  expect(
    ratings.filter((rating) => rating.source === "Rotten Tomatoes"),
  ).toHaveLength(2);
  expect(getPrimaryMediaRating(item)).toEqual(ratings[0]);
});

it("deduplicates legacy fields from the same provider while retaining sources with identical values", () => {
  expect(
    getMediaRatings({
      rating: 8,
      ratingImage: "imdb://image.rating",
      audienceRating: 8,
      audienceRatingImage: "imdb://image.rating",
    }),
  ).toHaveLength(1);
  expect(
    getMediaRatings({
      Rating: [
        { value: 8, type: "audience", image: "imdb://image.rating" },
        { value: 8, type: "audience", image: "tmdb://image.rating" },
      ],
    }),
  ).toHaveLength(2);
});

it("does not guess a provider from a missing image or an HTTP image URL", () => {
  expect(
    getMediaRatings({
      rating: 7.5,
      ratingImage: "https://example.com/logo.png",
    }),
  ).toEqual([{ value: 7.5, kind: "rating", source: undefined }]);
  expect(getMediaRatings({ rating: 7.5 }).map(mediaRatingLabel)).toEqual([
    "Rating",
  ]);
});

it.each([undefined, null, NaN, Infinity, -1, 10.1])(
  "ignores missing and invalid ratings (%s)",
  (value) => {
    expect(
      getMediaRatings({
        rating: value as number,
        audienceRating: value as number,
        userRating: value as number,
      }),
    ).toEqual([]);
  },
);

it("preserves a real zero provider score but treats zero personal rating as unrated", () => {
  expect(getMediaRatings({ rating: 0, userRating: 0 })).toEqual([
    { value: 0, source: undefined, kind: "rating" },
  ]);
  expect(getPrimaryMediaRating({ userRating: 8 })).toBeUndefined();
  expect(getPrimaryMediaRating({ rating: 8, audienceRating: NaN })?.value).toBe(
    8,
  );
});
