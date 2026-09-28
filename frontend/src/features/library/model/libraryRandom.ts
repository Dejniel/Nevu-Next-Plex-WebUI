const RANDOM_SEED_PREFIX = "nevu.library.randomSeed:";

export function libraryRandomSeedKey(profileKey: string, sectionId: number) {
  return `${RANDOM_SEED_PREFIX}${JSON.stringify([profileKey, sectionId])}`;
}

export function createLibraryRandomSeed() {
  return globalThis.crypto?.randomUUID?.().replaceAll("-", "") ||
    `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
}

export function getLibraryRandomSeed(profileKey: string, sectionId: number) {
  const key = libraryRandomSeedKey(profileKey, sectionId);
  const stored = localStorage.getItem(key);
  if (stored) return stored;
  const seed = createLibraryRandomSeed();
  localStorage.setItem(key, seed);
  return seed;
}

export function replaceLibraryRandomSeed(profileKey: string, sectionId: number) {
  const seed = createLibraryRandomSeed();
  localStorage.setItem(libraryRandomSeedKey(profileKey, sectionId), seed);
  return seed;
}
