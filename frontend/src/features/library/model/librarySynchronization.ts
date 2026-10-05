import type { LibraryFilterExpression } from "@nevu/contracts";
import {
  matchesMediaScope,
  type MediaChange,
  type SynchronizationDecision,
} from "entities/media/model";
import type { LibraryQuery } from "./libraryQuery";

// Field dependencies only: unknown Plex expressions require server revalidation.
const dependencies: Record<string, readonly string[]> = {
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
function unaffected(field: string, changed: readonly string[]) {
  const known = Object.hasOwn(dependencies, field) ? dependencies[field] : undefined;
  return known !== undefined && !known.some((dependency) => changed.includes(dependency));
}
function unaffectedFilters(
  filter: LibraryFilterExpression | undefined,
  fields: readonly string[],
): boolean {
  if (!filter) return true;
  return filter.kind === "clause"
    ? unaffected(filter.field, fields)
    : filter.children.every((child) => unaffectedFilters(child, fields));
}

export function decideLibrarySynchronization(
  serverId: string,
  query: LibraryQuery,
  change: MediaChange,
): SynchronizationDecision {
  if (!matchesMediaScope({ serverId, profileKey: query.profileKey }, change)) return "ignore";
  const movedSection =
    change.kind === "item" &&
    change.effect === "metadata" &&
    change.fields.includes("librarySectionID");
  // The new section alone does not identify the old section of a moved item.
  if (change.sectionId && change.sectionId !== String(query.sectionId) && !movedSection)
    return "ignore";
  if (change.kind === "recovery") return "refresh";
  if (change.kind === "list") return change.listKind === "collection" ? "refresh" : "ignore";
  if (change.effect !== "metadata") return "refresh";
  if (!change.fields.length) return "ignore";
  if (
    change.fields.some((field) =>
      [
        "type",
        "librarySectionID",
        "parentRatingKey",
        "grandparentRatingKey",
        "Collection",
      ].includes(field),
    )
  )
    return "refresh";
  if (
    query.source === "onDeck" ||
    ((!query.type || query.type === "show") && change.parentIds?.length)
  )
    return "refresh";
  const stableSort = query.sort
    .split(",")
    .every((term) => unaffected(term.split(":")[0], change.fields));
  return stableSort && unaffectedFilters(query.filterExpression, change.fields)
    ? "patch"
    : "refresh";
}
