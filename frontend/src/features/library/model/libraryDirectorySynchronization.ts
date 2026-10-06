import { changedMediaFields, mediaFieldsUnaffected, mediaMetadataIncludes } from "@nevu/contracts";
import { affectedMediaParents, type ReconciledMediaChange, type SynchronizationDecision } from "entities/media/model";

const controls = new Set(["sort", "type", "X-Plex-Container-Start", "X-Plex-Container-Size", ...Object.keys(mediaMetadataIncludes)]);
const structural = ["type", "librarySectionID", "parentRatingKey", "grandparentRatingKey"];

/** Describe dependencies only. Plex remains responsible for evaluating and ordering results. */
export function decideLibraryDirectorySynchronization(
  dir: string,
  props: Record<string, unknown> | null,
  data: Plex.MediaContainer | undefined,
  entry: ReconciledMediaChange,
): SynchronizationDecision {
  const { change, update, parentScopeUnknown } = entry;
  if (change.kind === "list") return "ignore";
  const path = dir.split("?")[0];
  const [, section, resource, value] = path.match(/^\/library\/sections\/([^/]+)(?:\/([^/]+))?(?:\/([^/]+))?$/) ?? [];
  const before = change.kind === "item" && change.id
    ? data?.Metadata?.find((item) => item.ratingKey === change.id) : undefined;
  const metadata = update?.metadata as Plex.Metadata | undefined;
  const compared = before && metadata ? changedMediaFields(before, metadata) : undefined;
  const fields = change.kind === "item" && change.effect === "metadata"
    ? [...new Set([...change.fields, ...(compared ?? [])])] : compared;
  const moved = fields?.includes("librarySectionID");
  if (section && change.sectionId && section !== change.sectionId && !moved) return "ignore";
  if (change.kind !== "item" || change.effect === "membership" || !fields) return "refresh";
  if (fields.includes("unknown") || fields.some((field) => structural.includes(field))) return "refresh";

  const params = new URLSearchParams(dir.split("?")[1]);
  for (const [key, value] of Object.entries(props ?? {})) params.set(key, String(value));
  const filtersStable = [...params.keys()].every((key) =>
    controls.has(key) || mediaFieldsUnaffected(key.replace(/[!<>=]+$/, ""), fields),
  );
  if (!filtersStable) return "refresh";
  // Section definitions have no item ordering or metadata occurrences.
  if (section && !resource) return "ignore";
  // Facet values change with their tags, independently of the title's own fields.
  if (section && resource && resource !== "all" && !value)
    return mediaFieldsUnaffected(resource, fields) ? "ignore" : "refresh";
  if (!section || (resource !== "all" && !value)) return "refresh";
  if (value && !mediaFieldsUnaffected(resource, fields)) return "refresh";
  const sorts = (params.get("sort") ?? "titleSort:asc").split(",");
  if (!sorts.every((term) => mediaFieldsUnaffected(term.split(":")[0], fields))) return "refresh";
  const parents = affectedMediaParents(entry);
  if (data?.Metadata?.some((item) => parents.includes(item.ratingKey))) return "refresh";
  const type = params.get("type") ?? data?.viewGroup;
  if ((parents.length || parentScopeUnknown) && type !== "1" && type !== "movie" && type !== "4" && type !== "episode")
    return "refresh";
  return before ? (metadata ? "patch" : "refresh") : data ? "ignore" : "refresh";
}
