export type LibraryCacheAction = "invalidate" | "clear";

export interface LibraryCacheScope {
  profileKey?: string;
  sectionId?: string;
}

type LibraryCacheListener = (
  action: LibraryCacheAction,
  scope?: LibraryCacheScope,
) => void;

const listeners = new Set<LibraryCacheListener>();

export function subscribeToLibraryCache(listener: LibraryCacheListener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function invalidateLibraryCache(scope?: LibraryCacheScope) {
  listeners.forEach((listener) =>
    scope ? listener("invalidate", scope) : listener("invalidate"),
  );
}

export function clearLibraryCache() {
  listeners.forEach((listener) => listener("clear"));
}
