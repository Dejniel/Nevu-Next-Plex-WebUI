type HeroCandidate = {
  art?: string | null;
};

export interface LibraryWindow {
  start: number;
  size: number;
  wrapSize: number;
}

export function hasHeroArtwork(item: HeroCandidate | null | undefined) {
  return typeof item?.art === "string" && item.art.trim().length > 0;
}

export function heroCandidates<T extends HeroCandidate>(
  items: T[] | null | undefined,
) {
  return (items || []).filter(hasHeroArtwork);
}

export function randomLibraryWindow(
  totalSize: number,
  windowSize = 8,
  random: () => number = Math.random,
): LibraryWindow | null {
  if (!Number.isInteger(totalSize) || totalSize <= 0 || windowSize <= 0)
    return null;

  const requestedSize = Math.min(Math.floor(windowSize), totalSize);
  const start = Math.min(
    totalSize - 1,
    Math.floor(Math.max(0, random()) * totalSize),
  );
  const size = Math.min(requestedSize, totalSize - start);

  return {
    start,
    size,
    wrapSize: requestedSize - size,
  };
}
