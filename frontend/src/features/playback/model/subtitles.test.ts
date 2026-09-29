import {
  defaultSubtitleSearchTitle,
  findAttachedSubtitle,
} from "./subtitles";
import type { SubtitleSearchResult } from "./subtitles";

const result: SubtitleSearchResult = {
  id: 77,
  key: "/library/streams/77",
  streamType: 3,
  codec: "srt",
  languageCode: "pol",
  title: "Movie.Release.2024",
};

it("uses the release filename as editable search text", () => {
  expect(defaultSubtitleSearchTitle("/movies/A Film (2024)/A.Film.1080p.mkv"))
    .toBe("A.Film.1080p");
  expect(defaultSubtitleSearchTitle("D:\\Movies\\A.Film.mp4"))
    .toBe("A.Film");
});

it("finds the downloaded stream in the active media version", () => {
  const stream = {
    id: 77,
    streamType: 3,
    index: 2,
    codec: "srt",
    languageCode: "pol",
    title: "Movie.Release.2024",
  } as Plex.Stream;
  const metadata = {
    Media: [
      {
        id: 44,
        Part: [{ id: 5, Stream: [stream] } as Plex.Part],
      } as Plex.Media,
    ],
  } as Plex.Metadata;

  expect(findAttachedSubtitle(metadata, 44, result)?.stream).toBe(stream);
  expect(findAttachedSubtitle(metadata, 45, result)).toBeUndefined();
});
