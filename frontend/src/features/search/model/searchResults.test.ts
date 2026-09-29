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
const directory = {
  Directory: { id: "3", tag: "Drama" },
} as Plex.SearchResult;

it("keeps supported titles and categories in their own collections", () => {
  expect(partitionSearchResults([movie, episode, directory])).toEqual({
    media: [movie.Metadata],
    directories: [directory.Directory],
  });
});

it("puts categories first without changing order within each group", () => {
  expect(searchSuggestions([movie, directory], 2)).toEqual([directory, movie]);
});
