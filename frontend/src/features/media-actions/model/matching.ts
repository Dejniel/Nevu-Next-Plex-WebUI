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
  parentName?: string;
}

export interface MetadataMatchAgent {
  identifier: string;
  name: string;
}

const matchTypes: Record<string, number> = {
  movie: 1,
  show: 2,
  artist: 8,
  album: 9,
};

export function metadataMatchType(type: string) {
  return Object.hasOwn(matchTypes, type) ? matchTypes[type] : undefined;
}

/** Native Plex title syntax; bare numeric titles such as 1917 stay titles. */
export function matchSearchTerm(value: string): {
  title: string;
  identifier: boolean;
} {
  let title = value.trim();
  let musicBrainz = /^mbid(?::\/\/|-)/i.test(title);
  if (!title) throw new Error("Enter a title or external ID.");
  if (/^https?:\/\//i.test(title)) {
    const url = new URL(title);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    const path = url.pathname;
    if (host === "imdb.com")
      title = `imdb-${path.match(/^\/title\/(tt\d+)(?:\/|$)/i)?.[1] ?? ""}`;
    else if (host === "themoviedb.org")
      title = `tmdb-${path.match(/^\/(?:movie|tv)\/(\d+)(?:[-/]|$)/)?.[1] ?? ""}`;
    else if (host === "thetvdb.com")
      title = `tvdb-${path.match(/^\/dereferrer\/series\/(\d+)(?:\/|$)/)?.[1] ?? ""}`;
    else if (host === "musicbrainz.org") {
      musicBrainz = true;
      if (path.startsWith("/release-group/"))
        throw new Error(
          "Use a MusicBrainz release ID, rather than a release group.",
        );
      title = path.match(/^\/(?:artist|release)\/([^/]+)/)?.[1] ?? "mbid-";
    } else
      throw new Error("Use an IMDb, TMDB, TVDB or MusicBrainz ID or link.");
  }
  title = title
    .replace(/^(imdb|tmdb|tvdb):\/\//i, "$1-")
    .replace(/^mbid(?::\/\/|-)/i, "");
  if (/^tt\d+$/i.test(title)) title = `imdb-${title}`;
  if (
    /^(?:imdb-tt\d+|(?:tmdb|tvdb)-\d+)$/i.test(title) ||
    /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(title)
  )
    return { title: title.toLowerCase(), identifier: true };
  if (musicBrainz)
    throw new Error("Enter a valid MusicBrainz artist or release ID.");
  if (/^(?:imdb|tmdb|tvdb|mbid)-/i.test(title))
    throw new Error(
      "Enter a valid external ID, such as imdb-tt1217209 or tvdb-110381.",
    );
  return { title, identifier: false };
}

export function metadataMatchCriteriaErrors(criteria: MetadataMatchCriteria) {
  const errors: { title?: string; year?: string } = {};
  try {
    const term = matchSearchTerm(criteria.title);
    if (
      !term.identifier &&
      criteria.year !== undefined &&
      (!Number.isInteger(criteria.year) ||
        criteria.year < 1870 ||
        criteria.year > 2200)
    )
      errors.year = "Enter a year from 1870 to 2200.";
  } catch (error) {
    errors.title =
      error instanceof Error ? error.message : "Enter a title or external ID.";
  }
  return errors;
}

export function normalizeMatchAgents(value: unknown): MetadataMatchAgent[] {
  if (!Array.isArray(value)) return [];
  const agents = new Map<string, MetadataMatchAgent>();
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const agent = entry as Record<string, unknown>;
    const identifier = optionalString(agent.identifier);
    const name = optionalString(agent.name);
    if (
      identifier &&
      name &&
      agent.primary !== false &&
      !identifier.endsWith(".none")
    )
      agents.set(identifier, { identifier, name });
  }
  return [...agents.values()];
}

export function isMatchedMetadata(item: Pick<MediaItemData, "guid">) {
  const guid = item.guid?.trim().toLowerCase();
  return Boolean(
    guid &&
      !guid.startsWith("local://") &&
      !guid.startsWith("com.plexapp.agents.none://") &&
      !guid.startsWith("tv.plex.agents.none://"),
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
  if (scheme === "mbid") return "MusicBrainz";
  if (scheme?.startsWith("tv.plex.agents.")) return "Plex agent";
  return scheme || "Metadata provider";
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : undefined;
}

export function normalizeMatchCandidates(
  value: unknown,
): MetadataMatchCandidate[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const candidate = entry as Record<string, unknown>;
    const guid = optionalString(candidate.guid);
    const name =
      optionalString(candidate.name) ?? optionalString(candidate.title);
    if (!guid || !name) return [];

    return [
      {
        guid,
        name,
        type: optionalString(candidate.type),
        year: typeof candidate.year === "number" ? candidate.year : undefined,
        thumb: optionalString(candidate.thumb),
        summary: optionalString(candidate.summary),
        parentName: optionalString(candidate.parentName),
      },
    ];
  });
}
