import { publishMediaChange, type MediaItemData } from "entities/media/model";
import { PlexClient } from "shared/api/PlexClient";
import { createMetadataSession } from "./metadataSession";
import {
  MetadataMatchCandidate,
  MetadataMatchCriteria,
  normalizeMatchCandidates,
  normalizeMatchAgents,
  matchSearchTerm,
  metadataMatchCriteriaErrors,
  metadataMatchType,
} from "../model/matching";

function entries(response: unknown, field: "Agent" | "SearchResult") {
  const container =
    response && typeof response === "object" && "MediaContainer" in response
      ? response.MediaContainer
      : null;
  if (!container || typeof container !== "object" || Array.isArray(container))
    throw new Error(
      `Plex returned invalid ${field === "Agent" ? "metadata agents" : "match results"}.`,
    );
  const value = (container as Record<string, unknown>)[field];
  if (value !== undefined && !Array.isArray(value))
    throw new Error(
      `Plex returned invalid ${field === "Agent" ? "metadata agents" : "match results"}.`,
    );
  return value;
}

function itemPath(ratingKey: string, suffix: string) {
  if (!ratingKey) throw new Error("The metadata item has no Plex ID.");
  return `/library/metadata/${encodeURIComponent(ratingKey)}/${suffix}`;
}

export function buildMatchSearchPath(
  ratingKey: string,
  criteria: MetadataMatchCriteria,
) {
  const error = Object.values(metadataMatchCriteriaErrors(criteria))[0];
  if (error) throw new Error(error);
  const term = matchSearchTerm(criteria.title);
  const params = new URLSearchParams({ manual: "1", title: term.title });
  if (!term.identifier && criteria.year)
    params.set("year", String(criteria.year));
  if (criteria.language?.trim())
    params.set("language", criteria.language.trim());
  if (criteria.agent?.trim()) params.set("agent", criteria.agent.trim());

  return `${itemPath(ratingKey, "matches")}?${params.toString()}`;
}

export function buildApplyMatchPath(
  ratingKey: string,
  candidate: MetadataMatchCandidate,
) {
  const params = new URLSearchParams({
    guid: candidate.guid,
    name: candidate.name,
  });
  return `${itemPath(ratingKey, "match")}?${params.toString()}`;
}

export function createMetadataMatcher(item: MediaItemData) {
  const session = createMetadataSession();
  const client = new PlexClient(() => session.token);
  const mediaType = metadataMatchType(item.type);
  const assertCurrent = (signal?: AbortSignal) => {
    session.assertCurrent(signal);
    if (!/^\d+$/.test(item.ratingKey) || mediaType === undefined)
      throw new Error("This item does not support Plex metadata matching.");
  };
  const write = async (path: string, signal?: AbortSignal) => {
    assertCurrent(signal);
    try {
      await client.put(path, {}, signal);
    } finally {
      // Aborted writes may already have reached PMS; reconcile the captured scope.
      if (session.scope)
        publishMediaChange({
          ...session.scope,
          kind: "item",
          effect: "unknown",
          id: item.ratingKey,
        });
    }
    assertCurrent(signal);
  };
  return {
    scope: session.scope,
    revision: session.revision,
    async agents(signal: AbortSignal) {
      assertCurrent(signal);
      const response = await client.get(
        `/system/agents?mediaType=${mediaType}`,
        signal,
      );
      assertCurrent(signal);
      return normalizeMatchAgents(entries(response, "Agent"));
    },
    async search(criteria: MetadataMatchCriteria, signal: AbortSignal) {
      assertCurrent(signal);
      const response = await client.get(
        buildMatchSearchPath(item.ratingKey, criteria),
        signal,
      );
      assertCurrent(signal);
      return normalizeMatchCandidates(entries(response, "SearchResult")).filter(
        (candidate) => !candidate.type || candidate.type === item.type,
      );
    },
    apply(candidate: MetadataMatchCandidate, signal: AbortSignal) {
      if (
        !candidate.guid.trim() ||
        !candidate.name.trim() ||
        (candidate.type && candidate.type !== item.type)
      )
        throw new Error("Select a match for this media type.");
      return write(buildApplyMatchPath(item.ratingKey, candidate), signal);
    },
    unmatch(signal?: AbortSignal) {
      return write(itemPath(item.ratingKey, "unmatch"), signal);
    },
  };
}
