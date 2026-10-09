import type { MediaMetadata } from "entities/media/model";
import { trackLanguages } from "./useTitleDetailsData";

it("returns unique track languages with display titles as fallback", () => {
  const data: MediaMetadata = {
    ratingKey: "1",
    type: "movie",
    title: "Movie",
    Media: [
      {
        id: 1,
        Part: [
          {
            id: 1,
            key: "/library/parts/1/file.mp4",
            Stream: (
              [
                { index: 0, streamType: 2, language: "English" },
                { index: 1, streamType: 2, language: "English" },
                { index: 2, streamType: 2, displayTitle: "Commentary" },
                { index: 3, streamType: 3, language: "Polish" },
              ] as const
            ).map((stream) => ({
              id: stream.index + 1,
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
