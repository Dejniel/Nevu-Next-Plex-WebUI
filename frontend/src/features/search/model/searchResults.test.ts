import {
  partitionSearchResults,
  searchSuggestions,
} from "./searchResults";

const movie = {
  Metadata: { ratingKey: "1", type: "movie", title: "Movie" },
} as Plex.SearchResult;
const episode = {
  Metadata: { ratingKey: "2", type: "episode", title: "Episode" },
} as Plex.SearchResult;
const directory: Plex.SearchResult = {
  score: 1,
  Directory: {
    id: 3,
    key: "/library/sections/1/genre/3",
    title: "Drama",
    tag: "Drama",
  },
};

it("keeps supported titles and categories in their own collections", () => {
  expect(partitionSearchResults([movie, episode, directory])).toEqual({
    media: [movie.Metadata],
    directories: [directory.Directory],
  });
});

it("puts categories first without changing order within each group", () => {
  expect(searchSuggestions([movie, directory], 2)).toEqual([directory, movie]);
});
