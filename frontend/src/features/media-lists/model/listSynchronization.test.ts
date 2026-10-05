import type { MediaChange } from "entities/media/model";
import { decideMediaListSynchronization } from "./listSynchronization";
import type { MediaListQuery } from "./mediaLists";

const scope = { serverId: "server", profileKey: "owner" };
const query: MediaListQuery = { kind: "playlist", id: "9", libraryID: "2" };
const item: Extract<MediaChange, { effect: "metadata" }> = {
  ...scope,
  kind: "item",
  effect: "metadata",
  id: "101",
  sectionId: "2",
  fields: ["title"],
};
const decide = (change: MediaChange, overrides: Partial<MediaListQuery> = {}, smart?: boolean) =>
  decideMediaListSynchronization(
    scope,
    { ...query, ...overrides },
    change,
    smart === undefined ? undefined : { smart },
  );

it("patches confirmed metadata in explicit playlist positions, including cross-library items", () => {
  expect(decide(item, {}, false)).toBe("patch");
  expect(decide({ ...item, sectionId: "3" }, {}, false)).toBe("patch");
  expect(decide({ ...item, fields: ["type"] }, {}, false)).toBe("refresh");
});

it("does not assume smart criteria or manual collection order from the current summary", () => {
  expect(decide(item, {}, true)).toBe("refresh");
  expect(decide(item)).toBe("refresh");
  expect(decide(item, { kind: "collection", id: "7" }, false)).toBe("refresh");
  expect(decide(item, { id: undefined }, false)).toBe("refresh");
});

it("targets list identities/listings and section-scoped collections", () => {
  const changed: Extract<MediaChange, { kind: "list" }> = {
    ...scope,
    kind: "list",
    listKind: "playlist",
    id: "9",
  };
  expect(decide(changed)).toBe("refresh");
  expect(decide({ ...changed, id: "10" })).toBe("ignore");
  expect(decide({ ...changed, id: "10" }, { id: undefined })).toBe("refresh");
  expect(decide({ ...changed, listKind: "collection" })).toBe("ignore");
  expect(decide({ ...item, sectionId: "3" }, { kind: "collection" })).toBe("ignore");
  expect(
    decide({ ...item, sectionId: "3", fields: ["librarySectionID"] }, { kind: "collection" }),
  ).toBe("refresh");
});

it("handles uncertainty, recovery and session isolation without consulting loaded membership", () => {
  for (const effect of ["unknown", "membership"] as const)
    expect(decide({ ...item, kind: "item", effect })).toBe("refresh");
  expect(decide({ ...scope, kind: "recovery" })).toBe("refresh");
  expect(decide({ ...item, profileKey: "other" })).toBe("ignore");
  expect(decide({ ...item, serverId: "other" })).toBe("ignore");
});
