import type { MediaMetadata } from "entities/media/model";
import {
  matchRecommendationDirectory,
  pickPreferredTag,
} from "./libraryRecommendations";

const metadata = (
  title: string,
  genres: string[] = [],
  roles: string[] = [],
) =>
  ({
    title,
    Genre: genres.map((tag) => ({ tag })),
    Role: roles.map((tag) => ({ tag })),
  }) as MediaMetadata;

it("prefers recurring genres from recent watch history", () => {
  const result = pickPreferredTag(
    [
      metadata("Recent", ["Drama", "Comedy"]),
      metadata("Second", ["Drama"]),
      metadata("Older", ["Action"]),
    ],
    "Genre",
  );

  expect(result?.title).toBe("Drama");
});

it("uses billing order to break otherwise equal actor choices", () => {
  const result = pickPreferredTag(
    [metadata("One", [], ["Lead", "Supporting"])],
    "Role",
  );

  expect(result?.title).toBe("Lead");
});

it("matches Plex directories without depending on letter case", () => {
  const directory = { key: "42", title: "Science Fiction" } as Plex.Directory;

  expect(
    matchRecommendationDirectory(
      { title: "science fiction", score: 1 },
      [directory],
    ),
  ).toBe(directory);
});
