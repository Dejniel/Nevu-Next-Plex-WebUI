export type ExtraSource = "local" | "discover";

export interface TitleExtra {
  source: ExtraSource;
  metadata: Plex.Metadata;
}

export function getDiscoverID(
  item: Partial<Pick<Plex.Metadata, "guid" | "Guid">>,
): string | null {
  const plexGuid = item.Guid?.find((guid) => guid.id.startsWith("plex://"))?.id;
  const guid = plexGuid || item.guid;
  const match = guid?.match(/^plex:\/\/(?:movie|show)\/([a-f0-9]+)$/i);
  return match?.[1] ?? null;
}

function extraIdentity(extra: Plex.Metadata): string[] {
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
