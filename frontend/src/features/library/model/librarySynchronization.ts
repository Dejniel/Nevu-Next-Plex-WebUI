import { isLibraryContainerType, libraryFieldsUnaffected, libraryFilterUnaffected } from "@nevu/contracts";
import {
  matchesMediaScope,
  type MediaChange,
  type SynchronizationDecision,
} from "entities/media/model";
import type { LibraryQuery } from "./libraryQuery";

export function libraryDependenciesUnaffected(query: LibraryQuery, fields: readonly string[]) {
  return (
    query.sort.split(",").every((term) => libraryFieldsUnaffected(term.split(":")[0], fields)) &&
    libraryFilterUnaffected(query.filterExpression, fields)
  );
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
    ((!query.type || isLibraryContainerType(query.type)) && change.parentIds?.length)
  )
    return "refresh";
  return libraryDependenciesUnaffected(query, change.fields) ? "patch" : "refresh";
}
