import {
  matchesMediaScope,
  type MediaChange,
  type MediaScope,
  type SynchronizationDecision,
} from "entities/media/model";
import type { MediaListQuery, MediaListSummary } from "./mediaLists";

export function decideMediaListSynchronization(
  scope: MediaScope,
  query: MediaListQuery,
  change: MediaChange,
  summary?: Pick<MediaListSummary, "smart">,
): SynchronizationDecision {
  if (!matchesMediaScope(scope, change)) return "ignore";
  const movedSection =
    change.kind === "item" &&
    change.effect === "metadata" &&
    change.fields.includes("librarySectionID");
  // libraryID on a playlist is navigation context, not a membership boundary.
  if (
    query.kind === "collection" &&
    query.libraryID &&
    change.sectionId &&
    query.libraryID !== change.sectionId &&
    !movedSection
  )
    return "ignore";
  if (change.kind === "recovery") return "refresh";
  if (change.kind === "list") {
    if (change.listKind !== query.kind || (query.id && change.id && query.id !== change.id))
      return "ignore";
    return "refresh";
  }
  if (change.effect !== "metadata") return "refresh";
  if (!change.fields.length) return "ignore";
  if (
    change.fields.some((field) =>
      ["type", "librarySectionID", "parentRatingKey", "grandparentRatingKey"].includes(field),
    )
  )
    return "refresh";
  // A manual playlist's positions are explicit. Collection ordering and smart
  // criteria are not exposed by the current summary contract; do not assume them.
  return query.kind === "playlist" && query.id && summary?.smart === false ? "patch" : "refresh";
}
