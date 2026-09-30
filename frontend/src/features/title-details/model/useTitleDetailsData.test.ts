import { selectInitialSeason, trackLanguages } from "./useTitleDetailsData";

it("selects the on-deck season before the first regular season", () => {
  const data = {
    OnDeck: { Metadata: { parentIndex: 3 } },
    Children: { Metadata: [{ index: 0 }, { index: 1 }] },
  } as Plex.Metadata;

  expect(selectInitialSeason(data)).toBe(3);
});

it("skips specials when choosing the first available season", () => {
  const data = {
    Children: { Metadata: [{ index: 4 }, { index: 0 }, { index: 2 }] },
  } as Plex.Metadata;

  expect(selectInitialSeason(data)).toBe(2);
  expect(selectInitialSeason({} as Plex.Metadata)).toBe(1);
});

it("returns unique track languages with display titles as fallback", () => {
  const data: Plex.Metadata = {
    ratingKey: "1",
    key: "/library/metadata/1",
    guid: "plex://movie/1",
    studio: "Studio",
    type: "movie",
    title: "Movie",
    librarySectionTitle: "Movies",
    librarySectionID: 1,
    librarySectionKey: "/library/sections/1",
    contentRating: "PG",
    summary: "",
    year: 2024,
    tagline: "",
    thumb: "",
    art: "",
    duration: 12000,
    originallyAvailableAt: "2024-01-01",
    addedAt: 0,
    updatedAt: 0,
    audienceRatingImage: "",
    Media: [
      {
        id: 1,
        duration: 12000,
        bitrate: 1000,
        width: 1280,
        height: 720,
        aspectRatio: 16 / 9,
        audioChannels: 2,
        audioCodec: "aac",
        videoCodec: "h264",
        videoResolution: "720",
        container: "mp4",
        videoFrameRate: "24p",
        audioProfile: "lc",
        videoProfile: "main",
        Part: [
          {
            id: 1,
            key: "/library/parts/1/file.mp4",
            duration: 12000,
            file: "/movies/movie.mp4",
            size: 1500000,
            audioProfile: "lc",
            container: "mp4",
            indexes: "",
            videoProfile: "main",
            Stream: [
              { index: 0, streamType: 2, language: "English" },
              { index: 1, streamType: 2, language: "English" },
              { index: 2, streamType: 2, displayTitle: "Commentary" },
              { index: 3, streamType: 3, language: "Polish" },
            ].map((stream) => ({
              id: stream.index + 1,
              default: false,
              codec: stream.streamType === 2 ? "aac" : "srt",
              bitrate: 0,
              language: "",
              languageTag: "",
              languageCode: "",
              displayTitle: "",
              extendedDisplayTitle: "",
              ...stream,
            })),
          },
        ],
      },
    ],
  };

  expect(trackLanguages(data, 2)).toEqual(["English", "Commentary"]);
  expect(trackLanguages(data, 3)).toEqual(["Polish"]);
});
