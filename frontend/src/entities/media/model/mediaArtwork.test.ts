import { mediaArtworkPath, mediaCardAspectRatio } from "./mediaArtwork";

it("prefers a poster thumbnail and falls back to art", () => {
  expect(mediaArtworkPath({ type: "movie", thumb: "/poster", art: "/art" }, "poster"))
    .toBe("/poster");
  expect(mediaArtworkPath({ type: "movie", thumb: "", art: "/art" }, "poster"))
    .toBe("/art");
});

it("uses episode thumbnails and landscape art for other media", () => {
  expect(mediaArtworkPath({ type: "episode", thumb: "/episode", art: "/show" }, "landscape"))
    .toBe("/episode");
  expect(mediaArtworkPath({ type: "movie", thumb: "/poster", art: "/backdrop" }, "landscape"))
    .toBe("/backdrop");
});

it("returns null instead of constructing an image URL from missing artwork", () => {
  expect(mediaArtworkPath({ type: "movie", thumb: "", art: " " }, "landscape"))
    .toBeNull();
});

it("uses album artwork for tracks and photo thumbnails in either orientation", () => {
  expect(mediaArtworkPath({ type: "track", parentThumb: "/album", art: "/artist/background" }, "square"))
    .toBe("/album");
  expect(mediaArtworkPath({ type: "photo", thumb: "/photo", art: "/background" }, "landscape"))
    .toBe("/photo");
  expect(mediaArtworkPath({ type: "photoalbum", composite: "/composite" }, "landscape"))
    .toBe("/composite");
  expect(mediaCardAspectRatio("square")).toBe(1);
});
