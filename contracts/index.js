"use strict";

// Dependencies, not a second Plex filter evaluator. Unknown fields need revalidation.
const dependencies = {
  random: [],
  title: ["title", "titleSort"],
  titleSort: ["title", "titleSort"],
  year: ["year"],
  addedAt: ["addedAt"],
  updated: ["updatedAt"],
  updatedAt: ["updatedAt"],
  originallyAvailableAt: ["originallyAvailableAt"],
  duration: ["duration"],
  rating: ["rating"],
  audienceRating: ["audienceRating"],
  userRating: ["userRating"],
  viewCount: ["viewCount", "viewedLeafCount"],
  unwatched: ["viewCount", "viewedLeafCount", "leafCount"],
  lastViewedAt: ["lastViewedAt"],
  genre: ["Genre"],
  collection: ["Collection"],
  studio: ["studio"],
  contentRating: ["contentRating"],
};
const metadataDependencies = {
  ...dependencies,
  actor: ["Role"],
  director: ["Director"],
  writer: ["Writer"],
  country: ["Country"],
};
function fieldsUnaffected(projectionDependencies, field, changed) {
  return (
    Object.hasOwn(projectionDependencies, field) &&
    !changed.includes("unknown") &&
    !projectionDependencies[field].some((value) => changed.includes(value))
  );
}
// Card comparisons cannot establish whether fields omitted from that projection changed.
const libraryFieldsUnaffected = (field, changed) => fieldsUnaffected(dependencies, field, changed);
const mediaFieldsUnaffected = (field, changed) =>
  fieldsUnaffected(metadataDependencies, field, changed);
function libraryFilterUnaffected(filter, changed) {
  if (!filter) return true;
  return filter.kind === "clause"
    ? libraryFieldsUnaffected(filter.field, changed)
    : filter.children.every((child) => libraryFilterUnaffected(child, changed));
}
function changedMediaFields(before, after) {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(
    (field) => JSON.stringify(before[field]) !== JSON.stringify(after[field]),
  );
}
const mediaMetadataIncludes = Object.fromEntries(
  [
    "Details",
    "Markers",
    "OnDeck",
    "Chapters",
    "Children",
    "ExternalMedia",
    "Extras",
    "Concerts",
    "Reviews",
    "Preferences",
    "Stations",
    "Related",
  ].map((name) => [`include${name}`, 1]),
);
export {
  libraryFieldsUnaffected,
  mediaFieldsUnaffected,
  libraryFilterUnaffected,
  changedMediaFields,
  mediaMetadataIncludes,
};

export {
  normalizePlexPreferences,
  preferenceValue,
  preferenceValueError,
  preferenceChanges,
  validatePreferenceChanges,
} from "./preferences.js";
