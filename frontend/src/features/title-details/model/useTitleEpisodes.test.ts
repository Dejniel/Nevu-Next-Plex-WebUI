import type { MediaMetadata } from "entities/media/model";
import { selectInitialSeason } from "./useTitleEpisodes";

const show = (indices: number[], onDeck?: number) =>
  ({
    type: "show",
    Children: {
      Metadata: indices.map((index) => ({ ratingKey: `s${index}`, index })),
    },
    OnDeck: { Metadata: { parentIndex: onDeck } },
  }) as MediaMetadata;

it("selects the available on-deck season before regular seasons", () => {
  expect(selectInitialSeason(show([0, 1, 3], 3))?.ratingKey).toBe("s3");
});
it("skips specials and stale on-deck references when a regular season is available", () => {
  expect(selectInitialSeason(show([4, 0, 2], 3))?.ratingKey).toBe("s2");
});
it("retains season zero and does not invent a season for an empty show", () => {
  expect(selectInitialSeason(show([0]))?.ratingKey).toBe("s0");
  expect(selectInitialSeason(show([]))).toBeUndefined();
});
