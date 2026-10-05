import { parsePlexServerChanges } from "./serverChanges";

it("normalizes singular and array timeline entries into narrow invalidation hints", () => {
  expect(
    parsePlexServerChanges(
      "timeline",
      JSON.stringify({ TimelineEntry: { sectionID: 2, itemID: "3", type: 1 } }),
    ),
  ).toEqual([{ kind: "library", sectionId: "2" }]);
  expect(
    parsePlexServerChanges(
      "timeline",
      JSON.stringify({
        NotificationContainer: {
          TimelineEntry: [
            { type: 18, sectionID: "2", itemID: 7 },
            { type: 15, itemID: "8" },
          ],
        },
      }),
    ),
  ).toEqual([
    { kind: "collection", sectionId: "2", id: "7" },
    { kind: "playlist", id: "8" },
  ]);
});

it("ignores malformed notifications, unrelated providers and playback progress", () => {
  expect(parsePlexServerChanges("timeline", "broken")).toEqual([]);
  expect(parsePlexServerChanges("timeline", "null")).toEqual([]);
  expect(
    parsePlexServerChanges(
      "timeline",
      JSON.stringify({ TimelineEntry: { identifier: "foreign", type: 1 } }),
    ),
  ).toEqual([]);
  expect(parsePlexServerChanges("playing", "{}")).toEqual([]);
  expect(parsePlexServerChanges("progress", "{}")).toEqual([]);
});

it("does not pass arbitrary identifiers or event payloads to consumers", () => {
  expect(
    parsePlexServerChanges(
      "timeline",
      JSON.stringify({
        TimelineEntry: { type: 18, sectionID: "../../etc", itemID: -1 },
      }),
    ),
  ).toEqual([{ kind: "collection", sectionId: undefined, id: undefined }]);
  expect(parsePlexServerChanges("preference", "{}")).toEqual([
    { kind: "server" },
  ]);
});
