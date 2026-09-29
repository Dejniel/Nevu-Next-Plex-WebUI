import type { MediaItemData } from "entities/media/model";

export interface MetadataMatchCriteria {
  title: string;
  year?: number;
  language?: string;
  agent?: string;
}

export interface MetadataMatchCandidate {
  guid: string;
  name: string;
  type?: string;
  year?: number;
  thumb?: string;
  summary?: string;
  lifespanEnded?: boolean;
}

export function isMatchedMetadata(item: Pick<MediaItemData, "guid">) {
  const guid = item.guid?.trim().toLowerCase();
  return Boolean(
    guid &&
      !guid.startsWith("local://") &&
      !guid.startsWith("com.plexapp.agents.none://"),
  );
}

export function matchActionLabel(item: Pick<MediaItemData, "guid">) {
  return isMatchedMetadata(item) ? "Fix Match" : "Match";
}

export function matchSourceLabel(guid: string) {
  const scheme = guid.split("://", 1)[0]?.toLowerCase();
  if (scheme === "plex") return "Plex";
  if (scheme === "imdb") return "IMDb";
  if (scheme === "tmdb") return "TMDB";
  if (scheme === "tvdb") return "TheTVDB";
  if (scheme?.startsWith("tv.plex.agents.")) return "Plex agent";
  return scheme || "Metadata provider";
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : undefined;
}

export function normalizeMatchCandidates(value: unknown): MetadataMatchCandidate[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const candidate = entry as Record<string, unknown>;
    const guid = optionalString(candidate.guid);
    const name = optionalString(candidate.name) ?? optionalString(candidate.title);
    if (!guid || !name) return [];

    return [{
      guid,
      name,
      type: optionalString(candidate.type),
      year: typeof candidate.year === "number" ? candidate.year : undefined,
      thumb: optionalString(candidate.thumb),
      summary: optionalString(candidate.summary),
      lifespanEnded:
        typeof candidate.lifespanEnded === "boolean"
          ? candidate.lifespanEnded
          : undefined,
    }];
  });
}
