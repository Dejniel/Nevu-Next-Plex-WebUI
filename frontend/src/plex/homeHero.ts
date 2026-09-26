type HeroCandidate = {
  art?: string | null;
};

export function hasHeroArtwork(item: HeroCandidate | null | undefined) {
  return typeof item?.art === "string" && item.art.trim().length > 0;
}

export function pickHeroCandidate<T extends HeroCandidate>(
  items: T[] | null | undefined,
  random: () => number = Math.random,
) {
  const candidates = (items || []).filter(hasHeroArtwork);
  if (!candidates.length) return null;

  return candidates[Math.floor(random() * candidates.length)] || null;
}
