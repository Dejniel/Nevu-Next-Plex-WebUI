import assert from "node:assert/strict";
import test from "node:test";

import {
  canManagePlexServer,
  hasPlexFeature,
  isPlexServerOwner,
} from "../dist/common/plex.js";
import {
  libraryKind,
  libraryLanguage,
  libraryLocations,
  libraryName,
  sectionId,
} from "../dist/common/libraryRules.js";

test("finds Plex capabilities in nested provider responses", () => {
  const providers = { MediaContainer: { MediaProvider: [{ Feature: [{ type: "manage" }] }] } };
  assert.equal(hasPlexFeature(providers, "manage"), true);
  assert.equal(hasPlexFeature(providers, "missing"), false);
  assert.equal(hasPlexFeature(null, "manage"), false);
});

test("allows management only to an unrestricted user with the manage capability", () => {
  const providers = { Feature: [{ type: "manage" }] };
  assert.equal(isPlexServerOwner({ restricted: false }), true);
  assert.equal(isPlexServerOwner({ restricted: true }), false);
  assert.equal(canManagePlexServer({ restricted: false }, providers), true);
  assert.equal(canManagePlexServer({ restricted: true }, providers), false);
  assert.equal(canManagePlexServer({ restricted: false }, {}), false);
  assert.equal(canManagePlexServer(null, providers), false);
});

test("validates library identifiers, names, languages and kinds", () => {
  assert.equal(sectionId("123"), "123");
  assert.equal(sectionId("1/refresh"), null);
  assert.equal(libraryName(" Movies "), "Movies");
  assert.equal(libraryName(" "), null);
  assert.equal(libraryLanguage("pl-PL"), "pl-PL");
  assert.equal(libraryLanguage("../pl"), null);
  assert.equal(libraryKind("show"), "show");
  assert.equal(libraryKind("unknown"), null);
});

test("accepts absolute library paths, removes duplicates and rejects relative paths", () => {
  assert.deepEqual(
    libraryLocations([" /media/movies ", "/media/movies", "D:\\Shows", "\\\\server\\share"]),
    ["/media/movies", "D:\\Shows", "\\\\server\\share"],
  );
  assert.equal(libraryLocations(["relative/path"]), null);
  assert.equal(libraryLocations([]), null);
  assert.equal(libraryLocations(new Array(21).fill("/media")), null);
});
