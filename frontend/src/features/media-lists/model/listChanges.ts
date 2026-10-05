import type { MediaListKind } from "./mediaLists";

export interface MediaListChange {
  profileKey: string;
  kind?: MediaListKind;
  id?: string;
  libraryID?: string;
}

const listeners = new Set<(change: MediaListChange) => void>();
export function invalidateMediaLists(change: MediaListChange) {
  listeners.forEach((listener) => listener(change));
}
export function subscribeToMediaListChanges(
  listener: (change: MediaListChange) => void,
) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
