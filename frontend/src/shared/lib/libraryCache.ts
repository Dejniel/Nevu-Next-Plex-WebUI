export type LibraryCacheAction = "invalidate" | "clear";

type LibraryCacheListener = (action: LibraryCacheAction) => void;

const listeners = new Set<LibraryCacheListener>();

export function subscribeToLibraryCache(listener: LibraryCacheListener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function invalidateLibraryCache() {
  listeners.forEach((listener) => listener("invalidate"));
}

export function clearLibraryCache() {
  listeners.forEach((listener) => listener("clear"));
}
