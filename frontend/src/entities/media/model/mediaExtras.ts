import type { MediaMetadata } from "plex/media";
import { getPlexTitleIdentity } from "./mediaIdentity";
type ExtraSource = "local" | "discover";

export interface TitleExtra {
  source: ExtraSource;
  metadata: MediaMetadata;
}

export function getDiscoverID(
  item: Partial<Pick<MediaMetadata, "guid" | "Guid">>,
): string | null {
  const plexGuid = item.Guid?.find((guid) => guid.id.startsWith("plex://"))?.id;
  const guid = plexGuid || item.guid;
  return getPlexTitleIdentity(guid)?.id ?? null;
}

function extraIdentity(extra: MediaMetadata): string[] {
  const title = (extra.title || "").trim().toLowerCase();
  const signature = [
    extra.extraType ?? "",
    extra.subtype ?? "",
    title,
    extra.duration ?? "",
  ].join("|");

  return [extra.guid, extra.key, extra.ratingKey, signature]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.toLowerCase());
}

export function mergeTitleExtras(
  localExtras: MediaMetadata[] = [],
  discoverExtras: MediaMetadata[] = [],
): TitleExtra[] {
  const seen = new Set<string>();
  const merged: TitleExtra[] = [];

  const append = (metadata: MediaMetadata, source: ExtraSource) => {
    const identities = extraIdentity(metadata);
    if (identities.some((identity) => seen.has(identity))) return;
    identities.forEach((identity) => seen.add(identity));
    merged.push({ source, metadata });
  };

  localExtras.forEach((extra) => append(extra, "local"));
  discoverExtras.forEach((extra) => append(extra, "discover"));
  return merged;
}

function isTrailer(extra: TitleExtra): boolean {
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
        metadata.key === primaryExtraKey ||
        metadata.ratingKey === primaryExtraKey,
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

export function extraTypeLabel(extra: MediaMetadata): string {
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
