import { create } from "zustand";
import { getServerSessionContext } from "../api/server";
import { AuthStorage } from "./authStorage";
import { hasPlexFeature } from "./serverCapabilities";

interface ServerSessionState {
  sessionID: string;
  plexSessionID: string;
  server: Plex.ServerPreferences | null;
  canManageServer: boolean;
  generateSessionID: () => void;
  refresh: () => Promise<void>;
  reset: () => void;
}

function randomID(length = 24) {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const values = new Uint8Array(length);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(values);
  else values.forEach((_, index) => (values[index] = Math.floor(Math.random() * 256)));
  return Array.from(values, (value) => alphabet[value % alphabet.length]).join(
    "",
  );
}

let refreshGeneration = 0;

export const useServerSession = create<ServerSessionState>((set) => ({
  sessionID: randomID(),
  plexSessionID: randomID(),
  server: null,
  canManageServer: false,

  generateSessionID: () =>
    set({ sessionID: randomID(), plexSessionID: randomID() }),

  refresh: async () => {
    const generation = ++refreshGeneration;
    const token = AuthStorage.getServerToken();
    if (!token) {
      set({ server: null, canManageServer: false });
      return;
    }

    try {
      const context = await getServerSessionContext(token);
      if (generation !== refreshGeneration) return;
      set({
        server: context.server,
        canManageServer: hasPlexFeature(context.providers, "manage"),
      });
    } catch (error) {
      if (generation !== refreshGeneration) return;
      console.error("Unable to load the Plex server session", error);
      set({ server: null, canManageServer: false });
    }
  },

  reset: () => {
    refreshGeneration += 1;
    set({ server: null, canManageServer: false });
  },
}));
