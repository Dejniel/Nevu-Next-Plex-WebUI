import { publishMediaChange } from "entities/media/model";
import { getActiveServerScope, plexClient } from "features/session/model";
import { invalidateLibraryCache } from "shared/lib/libraryCache";
import {
  MetadataMatchCandidate,
  MetadataMatchCriteria,
  normalizeMatchCandidates,
} from "../model/matching";

interface MatchResponse {
  MediaContainer?: {
    SearchResult?: unknown;
  };
}

function itemPath(ratingKey: string, suffix: string) {
  if (!ratingKey) throw new Error("The metadata item has no Plex ID.");
  return `/library/metadata/${encodeURIComponent(ratingKey)}/${suffix}`;
}

export function buildMatchSearchPath(ratingKey: string, criteria: MetadataMatchCriteria) {
  const title = criteria.title.trim();
  if (!title) throw new Error("A title is required to search for matches.");

  const params = new URLSearchParams({ manual: "1", title });
  if (criteria.year) params.set("year", String(criteria.year));
  if (criteria.language?.trim()) params.set("language", criteria.language.trim());
  if (criteria.agent?.trim()) params.set("agent", criteria.agent.trim());

  return `${itemPath(ratingKey, "matches")}?${params.toString()}`;
}

export function buildApplyMatchPath(ratingKey: string, candidate: MetadataMatchCandidate) {
  const params = new URLSearchParams({
    guid: candidate.guid,
    name: candidate.name,
  });
  if (candidate.year) params.set("year", String(candidate.year));
  return `${itemPath(ratingKey, "match")}?${params.toString()}`;
}

export async function searchMetadataMatches(ratingKey: string, criteria: MetadataMatchCriteria) {
  const response = await plexClient.get<MatchResponse>(buildMatchSearchPath(ratingKey, criteria));
  return normalizeMatchCandidates(response.MediaContainer?.SearchResult);
}

export async function applyMetadataMatch(ratingKey: string, candidate: MetadataMatchCandidate) {
  const scope = getActiveServerScope();
  await plexClient.put(buildApplyMatchPath(ratingKey, candidate), {});
  invalidateLibraryCache(scope ? { profileKey: scope.profileKey } : undefined);
  if (scope) publishMediaChange({ ...scope, kind: "item", effect: "unknown", id: ratingKey });
}

export async function unmatchMetadata(ratingKey: string) {
  const scope = getActiveServerScope();
  await plexClient.put(itemPath(ratingKey, "unmatch"), {});
  invalidateLibraryCache(scope ? { profileKey: scope.profileKey } : undefined);
  if (scope) publishMediaChange({ ...scope, kind: "item", effect: "unknown", id: ratingKey });
}
