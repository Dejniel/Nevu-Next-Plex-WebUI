import type { MediaMetadata, MediaRendition, MediaStream } from "plex/media";
import {
  chooseBestMediaVersion,
  getTrackChoices,
  getMediaVersions,
  findPreferredStream,
  mediaQualityBadge,
  mediaVersionDetails,
  parseTrackPreference,
  preferenceFromStream,
} from "./mediaVersions";

function stream(
  id: number,
  streamType: number,
  title: string,
  languageCode: string,
): MediaStream {
  return {
    id,
    streamType,
    index: id,
    codec: streamType === 2 ? "aac" : "srt",
    languageCode,
    extendedDisplayTitle: title,
    displayTitle: title,
  } as MediaStream;
}

function metadata(): MediaMetadata {
  return {
    ratingKey: "1",
    Media: [
      {
        id: 10,
        width: 1920,
        height: 1080,
        bitrate: 8000,
        videoResolution: "1080",
        videoCodec: "h264",
        Part: [
          {
            id: 11,
            key: "/library/parts/11/file.mp4",
            Stream: [stream(1, 2, "English AAC", "eng")],
          },
        ],
      } as MediaRendition,
      {
        id: 20,
        width: 3840,
        height: 2160,
        bitrate: 30000,
        videoResolution: "4k",
        videoDynamicRange: "HDR10",
        videoCodec: "hevc",
        Part: [
          {
            id: 21,
            key: "/library/parts/21/file.mkv",
            Stream: [
              stream(2, 2, "Polish AAC", "pol"),
              stream(3, 3, "Polish SRT", "pol"),
            ],
          },
        ],
      } as MediaRendition,
    ],
  } as MediaMetadata;
}

it("chooses the highest quality version without track preferences", () => {
  expect(chooseBestMediaVersion(metadata())?.mediaIndex).toBe(1);
});

it("does not choose an unavailable rendition over an existing playable file", () => {
  const data = metadata();
  data.Media?.unshift({ height: 4320, bitrate: 50000, Part: [{ id: 30 }] });
  expect(getMediaVersions(data).map((version) => version.mediaIndex)).toEqual([
    1, 2,
  ]);
  expect(chooseBestMediaVersion(data)?.mediaIndex).toBe(2);
});

it("matches a named track without its optional index and avoids matching unnamed tracks by undefined index", () => {
  const version = chooseBestMediaVersion(metadata())!;
  const track = version.part.Stream![0];
  delete track.index;
  const preference = preferenceFromStream(track);
  expect(parseTrackPreference(JSON.stringify(preference))).toEqual(preference);
  expect(findPreferredStream(version, 2, preference)).toBe(track);
  expect(findPreferredStream(version, 2, { title: "" })).toBeUndefined();
});

it("prefers a lower quality version when it is the only track match", () => {
  expect(
    chooseBestMediaVersion(metadata(), {
      index: 1,
      title: "English AAC",
      languageCode: "eng",
    })?.mediaIndex,
  ).toBe(0);
});

it("collects tracks from every media version", () => {
  expect(
    getTrackChoices(metadata(), 2).map(({ mediaIndex, stream }) => [
      mediaIndex,
      stream.id,
    ]),
  ).toEqual([
    [0, 1],
    [1, 2],
  ]);
});

it("round-trips a stored track preference", () => {
  const preference = preferenceFromStream(stream(2, 2, "Polish AAC", "pol"));
  expect(parseTrackPreference(JSON.stringify(preference))).toEqual(preference);
  expect(parseTrackPreference("invalid")).toBeNull();
});

it("formats a concise version description", () => {
  const version = chooseBestMediaVersion(metadata());
  expect(version && mediaVersionDetails(version)).toBe("4k · HEVC · 30.0 Mb/s");
});

it("formats a compact badge from the best available media version", () => {
  expect(mediaQualityBadge(metadata())).toBe("4K HDR10");
  expect(mediaQualityBadge({ ratingKey: "2" } as MediaMetadata)).toBeNull();
});
