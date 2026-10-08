import type { LibraryMusicCardDto, LibraryPhotoCardDto } from "@nevu/contracts";
import { mediaCardText } from "./mediaCardText";

const music: LibraryMusicCardDto = { ratingKey: "1", title: "Title", type: "track" };

it("describes artists, albums and tracks without video labels", () => {
  expect(mediaCardText({ ...music, type: "artist", childCount: 1 }, "square"))
    .toEqual({ title: "Title", subtitle: "1 Album" });
  expect(mediaCardText({ ...music, type: "album", parentTitle: "Artist", year: 2020, leafCount: 12 }, "square"))
    .toEqual({ title: "Title", subtitle: "Artist · 2020 · 12 Tracks" });
  expect(mediaCardText({ ...music, grandparentTitle: "Artist", parentTitle: "Album", duration: 185000 }, "square"))
    .toEqual({ title: "Title", subtitle: "Artist · Album · 3:05" });
});

it("describes photos and albums with their own ancestry and dates", () => {
  const photo: LibraryPhotoCardDto = { ratingKey: "2", title: "Photo", type: "photo", parentTitle: "Trip", originallyAvailableAt: "2026-10-01" };
  expect(mediaCardText(photo, "landscape")).toEqual({ title: "Photo", subtitle: "Trip · 2026-10-01" });
  expect(mediaCardText({ ...photo, type: "photoalbum", childCount: 20 }, "landscape").subtitle)
    .toBe("Trip · 20 items");
});

it("does not invent album names, counts or durations when Plex omits them", () => {
  expect(mediaCardText(music, "square")).toEqual({ title: "Title", subtitle: "" });
});

it("identifies seasons by their show and season rather than repeating indistinguishable Season 1 cards", () => {
  expect(mediaCardText({ ratingKey: "3", guid: "local://3", type: "season", title: "Season 1", parentTitle: "Show", leafCount: 1 }, "poster"))
    .toEqual({ title: "Show", subtitle: "Season 1 · 1 Episode" });
});
