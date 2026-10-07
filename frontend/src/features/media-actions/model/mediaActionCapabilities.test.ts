import type { MediaItemData } from "entities/media/model";
import type { LibraryCardDto, LibraryVideoCardDto } from "@nevu/contracts";
import { getMediaActionCapabilities } from "./mediaActionCapabilities";

const manager = {
  localItem: true,
  canManageServer: true,
  allowDownloads: true,
};
const movie = {
  ratingKey: "1",
  title: "Movie",
  type: "movie",
  guid: "plex://movie/1",
} satisfies LibraryVideoCardDto;

it("allows a manager to edit, match, unmatch, download and mark a local movie", () => {
  expect(getMediaActionCapabilities(movie, manager)).toEqual({
    canEditMetadata: true,
    canMatch: true,
    canUnmatch: true,
    canDownload: true,
    canSetWatched: true,
    similarRatingKey: "1",
    canAddToCollection: true,
    canAddToPlaylist: true,
  });
});

it.each(["local://1", "com.plexapp.agents.none://1", ""])(
  "allows matching but not unmatching an unmatched GUID: %s",
  (guid) => {
    expect(
      getMediaActionCapabilities({ ...movie, guid }, manager),
    ).toMatchObject({
      canMatch: true,
      canUnmatch: false,
    });
  },
);

it("allows managing a show but downloads only individual video files", () => {
  expect(
    getMediaActionCapabilities({ ...movie, type: "show" }, manager),
  ).toEqual({
    canEditMetadata: true,
    canMatch: true,
    canUnmatch: true,
    canDownload: false,
    canSetWatched: true,
    similarRatingKey: "1",
    canAddToCollection: true,
    canAddToPlaylist: true,
  });
});

it("allows editing and downloading an episode and uses its show for similar titles", () => {
  expect(
    getMediaActionCapabilities(
      {
        ...movie,
        type: "episode",
        parentRatingKey: "season",
        grandparentRatingKey: "show",
      },
      manager,
    ),
  ).toEqual({
    canEditMetadata: true,
    canMatch: false,
    canUnmatch: false,
    canDownload: true,
    canSetWatched: true,
    similarRatingKey: "show",
    canAddToCollection: false,
    canAddToPlaylist: true,
  });
});

it("does not offer similar titles for an episode without its show's Plex ID", () => {
  expect(
    getMediaActionCapabilities({ ...movie, type: "episode" }, manager)
      .similarRatingKey,
  ).toBeNull();
});

it("keeps watched, similar and permitted download actions available to a non-manager", () => {
  expect(
    getMediaActionCapabilities(movie, { ...manager, canManageServer: false }),
  ).toEqual({
    canEditMetadata: false,
    canMatch: false,
    canUnmatch: false,
    canDownload: true,
    canSetWatched: true,
    similarRatingKey: "1",
    canAddToCollection: false,
    canAddToPlaylist: true,
  });
});

it.each(["movie", "show", "episode"])(
  "does not expose server actions for a remote %s even to a manager",
  (type) => {
    const remote = {
      ...movie,
      type,
      grandparentRatingKey: "show",
    } as MediaItemData;
    expect(
      getMediaActionCapabilities(remote, { ...manager, localItem: false }),
    ).toEqual({
      canEditMetadata: false,
      canMatch: false,
      canUnmatch: false,
      canDownload: false,
      canSetWatched: false,
      similarRatingKey: null,
      canAddToCollection: false,
      canAddToPlaylist: false,
    });
  },
);

it.each([true, false])(
  "respects disabled downloads regardless of management access: %s",
  (canManageServer) => {
    expect(
      getMediaActionCapabilities(movie, {
        ...manager,
        canManageServer,
        allowDownloads: false,
      }).canDownload,
    ).toBe(false);
  },
);

it("requires a Plex ID for similar titles", () => {
  expect(
    getMediaActionCapabilities({ ...movie, ratingKey: "" }, manager)
      .similarRatingKey,
  ).toBeNull();
});

it("keeps local metadata editing independent from support for matching and downloads", () => {
  const season = { ...movie, type: "season" } as Plex.Metadata;
  expect(getMediaActionCapabilities(season, manager)).toMatchObject({
    canEditMetadata: true,
    canMatch: false,
    canUnmatch: false,
    canDownload: false,
  });
});

it("leaves its item and request context untouched", () => {
  getMediaActionCapabilities(Object.freeze(movie), Object.freeze(manager));
  expect(movie.guid).toBe("plex://movie/1");
  expect(manager.localItem).toBe(true);
});

it.each(["artist", "album", "track", "photoalbum", "photo"] as const)(
  "does not expose video workflows for a %s", type => {
    const item: LibraryCardDto = { ratingKey: "10", type, title: "Catalog item" };
    expect(getMediaActionCapabilities(item, manager))
      .toEqual({ canEditMetadata: false, canMatch: false, canUnmatch: false,
        canDownload: false, canSetWatched: false, similarRatingKey: null,
        canAddToCollection: false, canAddToPlaylist: false });
  },
);
