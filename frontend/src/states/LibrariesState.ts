import { create } from "zustand";
import { getAllLibraries } from "../plex";
import { invalidateLibraryCache } from "shared/lib/libraryCache";

interface LibrariesState {
  libraries: Plex.LibarySection[] | null;
  loading: boolean;
  error: string | null;
  load: () => Promise<void>;
  reset: () => void;
}

export const LIBRARIES_CHANGED_EVENT = "nevu:libraries-changed";

export const useLibraries = create<LibrariesState>((set) => ({
  libraries: null,
  loading: false,
  error: null,
  load: async () => {
    set({ loading: true, error: null });
    try {
      set({ libraries: await getAllLibraries(), loading: false });
    } catch {
      set({ error: "Could not load Plex libraries.", loading: false });
    }
  },
  reset: () => set({ libraries: null, loading: false, error: null }),
}));

export function notifyLibrariesChanged() {
  invalidateLibraryCache();
  window.dispatchEvent(new Event(LIBRARIES_CHANGED_EVENT));
}
