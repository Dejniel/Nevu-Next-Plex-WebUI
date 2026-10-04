import { canWatchlist, getWatchlistID } from "./watchlistItem";

it("allows matched films and shows but not episodes, seasons or local-only identifiers", () => {
  expect(canWatchlist({ type: "movie", guid: "plex://movie/123" })).toBe(true);
  expect(canWatchlist({ type: "show", guid: "plex://show/456" })).toBe(true);
  expect(canWatchlist({ type: "episode", guid: "plex://episode/123" })).toBe(
    false,
  );
  expect(canWatchlist({ type: "season", guid: "plex://season/123" })).toBe(
    false,
  );
  expect(
    canWatchlist({
      type: "movie",
      guid: "com.plexapp.agents.none://local?lang=en",
    }),
  ).toBe(false);
  expect(getWatchlistID("plex://movie/")).toBeNull();
  expect(getWatchlistID("https://example.com/movie/123")).toBeNull();
});
