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
  studio: ["studio"],
  contentRating: ["contentRating"],
};
function libraryFieldsUnaffected(field, changed) {
  return (
    Object.hasOwn(dependencies, field) &&
    !dependencies[field].some((value) => changed.includes(value))
  );
}
function libraryFilterUnaffected(filter, changed) {
  if (!filter) return true;
  return filter.kind === "clause"
    ? libraryFieldsUnaffected(filter.field, changed)
    : filter.children.every((child) => libraryFilterUnaffected(child, changed));
}
function changedLibraryFields(before, after) {
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
module.exports = {
  libraryFieldsUnaffected,
  libraryFilterUnaffected,
  changedLibraryFields,
  mediaMetadataIncludes,
};
