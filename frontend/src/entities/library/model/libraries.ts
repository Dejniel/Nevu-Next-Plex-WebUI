import { create } from "zustand";
import { getActiveServerScope } from "features/session/model";
import { publishMediaChange } from "entities/media/model";
import { getLibraries } from "../api/libraries";

interface LibrariesState {
  libraries: Plex.LibarySection[] | null;
  loading: boolean;
  error: string | null;
  load: () => Promise<void>;
  reset: () => void;
}

export const LIBRARIES_CHANGED_EVENT = "nevu:libraries-changed";

let loadGeneration = 0;

export const useLibraries = create<LibrariesState>((set) => ({
  libraries: null,
  loading: false,
  error: null,
  load: async () => {
    const generation = ++loadGeneration;
    set({ loading: true, error: null });
    try {
      const libraries = await getLibraries();
      if (generation === loadGeneration) set({ libraries, loading: false });
    } catch {
      if (generation === loadGeneration)
        set({ error: "Could not load Plex libraries.", loading: false });
    }
  },
  reset: () => {
    loadGeneration += 1;
    set({ libraries: null, loading: false, error: null });
  },
}));

export function notifyLibrariesChanged() {
  const scope = getActiveServerScope();
  if (scope) publishMediaChange({ ...scope, kind: "recovery" });
  window.dispatchEvent(new Event(LIBRARIES_CHANGED_EVENT));
}
