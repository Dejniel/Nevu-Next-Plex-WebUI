import { mediaChangeFromServer, parsePlexServerChanges } from "./serverChanges";
import fixture from "./fixtures/serverTimeline.json";

const scope = { serverId: "server", profileKey: "owner" };
const parse = (entries: unknown) =>
  parsePlexServerChanges("timeline", JSON.stringify({ TimelineEntry: entries }));

it("normalizes singular and array timeline entries into narrow invalidation hints", () => {
  expect(
    parsePlexServerChanges(
      "timeline",
      JSON.stringify({ TimelineEntry: { sectionID: 2, itemID: "3", type: 1 } }),
    ),
  ).toEqual([{ kind: "library", sectionId: "2", id: "3", type: 1 }]);
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
    { kind: "collection", sectionId: "2", id: "7", type: 18 },
    { kind: "playlist", id: "8", type: 15 },
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
  ).toEqual([{ kind: "collection", type: 18 }]);
  expect(parsePlexServerChanges("preference", "{}")).toEqual([
    { kind: "server", reason: "preference" },
  ]);
});

it("retains sanitized timeline details from observed Plex SSE payloads", () => {
  const events = fixture.samples.flatMap(({ event, data }) =>
    parsePlexServerChanges(event, JSON.stringify(data)),
  );
  expect(events).toEqual([
    {
      kind: "library",
      identifier: "com.plexapp.plugins.library",
      sectionId: "1",
      id: "101",
      type: 1,
      state: 3,
      updatedAt: 1700000000,
      metadataState: "loading",
    },
    {
      kind: "library",
      identifier: "com.plexapp.plugins.library",
      sectionId: "1",
      id: "101",
      type: 1,
      state: 5,
      updatedAt: 1700000000,
    },
    {
      kind: "playlist",
      identifier: "com.plexapp.plugins.library",
      sectionId: "1",
      id: "201",
      type: 15,
      state: 0,
      updatedAt: 1700000000,
      metadataState: "created",
    },
    {
      kind: "playlist",
      identifier: "com.plexapp.plugins.library",
      sectionId: "1",
      id: "201",
      type: 15,
      state: 9,
      updatedAt: 1700000000,
      metadataState: "deleted",
    },
  ]);
  expect(events.slice(0, 2).map((event) => mediaChangeFromServer(event, scope))).toEqual([
    { ...scope, sectionId: "1", id: "101", kind: "item", effect: "unknown" },
    { ...scope, sectionId: "1", id: "101", kind: "item", effect: "unknown" },
  ]);
});

it("discards malformed neighbors without losing valid changes", () => {
  expect(
    parse([
      null,
      "invalid",
      [],
      { type: "18", sectionID: 2, itemID: 7 },
      { identifier: "foreign", type: 1 },
    ]),
  ).toEqual([{ kind: "collection", type: 18, sectionId: "2", id: "7" }]);
});

it("does not coerce booleans, numeric garbage, or expose partial metadata", () => {
  expect(
    parse({
      type: 18,
      sectionID: "../../etc",
      itemID: -1,
      state: true,
      updatedAt: "Infinity",
      metadataState: "a/path",
      title: "Private",
      token: "secret",
    }),
  ).toEqual([{ kind: "collection", type: 18 }]);
  expect(
    parse({ type: true, state: "5junk", sectionID: 2, itemID: "3", mediaState: "loading" }),
  ).toEqual([{ kind: "library", sectionId: "2", id: "3", mediaState: "loading" }]);
});

it.each([0, 9])(
  "treats library state %s as structural without inferring complete metadata",
  (state) => {
    const event = parse({
      identifier: "com.plexapp.plugins.library",
      itemID: "3",
      sectionID: 2,
      type: 1,
      state,
    })[0];
    expect(mediaChangeFromServer(event, scope)).toEqual({
      ...scope,
      kind: "item",
      id: "3",
      sectionId: "2",
      effect: "membership",
    });
  },
);

it.each([1, 2, 3, 4, 5, 99])("keeps processing/unknown state %s as uncertain", (state) => {
  for (const identifier of [undefined, "com.plexapp.plugins.library"]) {
    expect(
      mediaChangeFromServer(parse({ identifier, itemID: "3", type: 1, state })[0], scope),
    ).toEqual({ ...scope, kind: "item", id: "3", effect: "unknown" });
  }
});

it("preserves narrow list identity and recovery causes without assuming a missing provider", () => {
  expect(mediaChangeFromServer(parse({ itemID: "3", type: 1, state: 9 })[0], scope)).toEqual({
    ...scope,
    kind: "item",
    id: "3",
    effect: "unknown",
  });
  expect(mediaChangeFromServer(parse({ type: 18, itemID: 7, sectionID: 2 })[0], scope)).toEqual({
    ...scope,
    sectionId: "2",
    kind: "list",
    listKind: "collection",
    id: "7",
  });
  expect(parsePlexServerChanges("provider.change", "{}")).toEqual([
    { kind: "server", reason: "provider.change" },
  ]);
  expect(mediaChangeFromServer({ kind: "server", reason: "reconnect" }, scope)).toEqual({
    ...scope,
    kind: "recovery",
  });
});
