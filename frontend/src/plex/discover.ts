import axios from "axios";
import { AuthStorage } from "../auth/AuthStorage";
import { getBackendURL } from "shared/api/backend";
import { queryBuilder } from "./QuickFunctions";

export type ExtraSource = "local" | "discover";

export interface TitleExtra {
  source: ExtraSource;
  metadata: Plex.Metadata;
}

function discoverHeaders() {
  return {
    "X-Plex-Token": AuthStorage.getProfileAccountToken() || "",
    "X-Plex-Client-Identifier": localStorage.getItem("clientID") || "nevu-web",
  };
}

export function getDiscoverID(item: Plex.Metadata): string | null {
  const plexGuid = item.Guid?.find((guid) => guid.id.startsWith("plex://"))?.id;
  const guid = plexGuid || item.guid;
  const match = guid?.match(/^plex:\/\/(?:movie|show)\/([a-f0-9]+)$/i);
  return match?.[1] ?? null;
}

function extraIdentity(extra: Plex.Metadata): string[] {
  const title = (extra.title || "").trim().toLowerCase();
  const signature = [extra.extraType ?? "", extra.subtype ?? "", title, extra.duration ?? ""].join("|");

  return [extra.guid, extra.key, extra.ratingKey, signature]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.toLowerCase());
}

export function mergeTitleExtras(
  localExtras: Plex.Metadata[] = [],
  discoverExtras: Plex.Metadata[] = [],
): TitleExtra[] {
  const seen = new Set<string>();
  const merged: TitleExtra[] = [];

  const append = (metadata: Plex.Metadata, source: ExtraSource) => {
    const identities = extraIdentity(metadata);
    if (identities.some((identity) => seen.has(identity))) return;
    identities.forEach((identity) => seen.add(identity));
    merged.push({ source, metadata });
  };

  localExtras.forEach((extra) => append(extra, "local"));
  discoverExtras.forEach((extra) => append(extra, "discover"));
  return merged;
}

export function isTrailer(extra: TitleExtra): boolean {
  return (
    extra.metadata.extraType === 1 ||
    extra.metadata.subtype?.toLowerCase() === "trailer"
  );
}

export function selectPrimaryTrailer(
  extras: TitleExtra[],
  primaryExtraKey?: string | null,
): TitleExtra | null {
  if (primaryExtraKey) {
    const primary = extras.find(
      ({ metadata }) =>
        metadata.key === primaryExtraKey || metadata.ratingKey === primaryExtraKey,
    );
    if (primary && isTrailer(primary)) return primary;
  }
  return extras.find(isTrailer) ?? null;
}

export function withoutExtra(
  extras: TitleExtra[],
  selected: TitleExtra | null,
): TitleExtra[] {
  if (!selected) return extras;
  return extras.filter((extra) => extra !== selected);
}

export function extraTypeLabel(extra: Plex.Metadata): string {
  if (extra.subtype) {
    return extra.subtype
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/^./, (letter) => letter.toUpperCase());
  }

  switch (extra.extraType) {
    case 1:
      return "Trailer";
    case 5:
      return "Featurette";
    case 6:
      return "Scene";
    default:
      return "Extra";
  }
}

export async function fetchDiscoverExtras(
  item: Plex.Metadata,
): Promise<Plex.Metadata[]> {
  const discoverID = getDiscoverID(item);
  if (!discoverID || !AuthStorage.getProfileAccountToken()) return [];

  const path = `/library/metadata/${discoverID}/extras`;
  const response = await axios.post(
    `${getBackendURL()}/discover/extras`,
    { path },
    { headers: discoverHeaders() },
  );
  return response.data?.MediaContainer?.Metadata ?? [];
}

function getPlayablePart(
  extra: Plex.Metadata,
  requireHLS = false,
): Plex.Part | null {
  const parts = extra.Media?.flatMap((media) => media.Part || []) ?? [];
  const hls = parts.find((part) =>
    part.key?.split("?")[0].endsWith("/parts/hls.m3u8"),
  );
  return hls ?? (requireHLS ? null : parts[0] ?? null);
}

export async function resolveExtraURL(extra: TitleExtra): Promise<string> {
  const part = getPlayablePart(extra.metadata, extra.source === "discover");
  if (!part?.key) throw new Error("This extra does not have a playable stream.");

  if (extra.source === "local") {
    return `${getBackendURL()}/dynproxy${part.key.split("?")[0]}?${queryBuilder({
      "X-Plex-Token": AuthStorage.getServerToken(),
      ...Object.fromEntries(
        new URL("http://plex.local" + part.key).searchParams.entries(),
      ),
    })}`;
  }

  const response = await axios.post(
    `${getBackendURL()}/discover/stream`,
    { path: part.key.split("?")[0] },
    { headers: discoverHeaders() },
  );
  if (!response.data?.url) throw new Error("Plex Discover did not return a stream.");
  return response.data.url;
}
