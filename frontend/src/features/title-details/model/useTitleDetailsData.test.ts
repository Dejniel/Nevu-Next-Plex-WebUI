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
  const data = {
    Media: [
      {
        Part: [
          {
            Stream: [
              { index: 0, streamType: 2, language: "English" },
              { index: 1, streamType: 2, language: "English" },
              { index: 2, streamType: 2, displayTitle: "Commentary" },
              { index: 3, streamType: 3, language: "Polish" },
            ],
          },
        ],
      },
    ],
  } as Plex.Metadata;

  expect(trackLanguages(data, 2)).toEqual(["English", "Commentary"]);
  expect(trackLanguages(data, 3)).toEqual(["Polish"]);
});
