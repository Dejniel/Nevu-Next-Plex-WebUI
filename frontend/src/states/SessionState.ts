import { create } from "zustand";
import { authedGet, makeid } from "../plex/QuickFunctions";
import { hasPlexFeature } from "../plex/serverCapabilities";

type SessionState = {
    sessionID: string;
    XPlexSessionID: string;
    PlexServer: Plex.ServerPreferences | null;
    canManageServer: boolean;
    generateSessionID: () => void;
    fetchPlexServer: () => Promise<void>;
    reset: () => void;
};

export const useSessionStore = create<SessionState>((set) => ({
    sessionID: makeid(24),
    XPlexSessionID: makeid(24),
    PlexServer: null,
    canManageServer: false,
    generateSessionID: () => {
        set({ sessionID: makeid(24), XPlexSessionID: makeid(24) });
    },
    fetchPlexServer: async () => {
        try {
            const [res, providers] = await Promise.all([
                authedGet("/"),
                authedGet("/media/providers"),
            ]);
            if (!res) {
                set({ PlexServer: null, canManageServer: false });
                return;
            }

            set({
                PlexServer: res.MediaContainer ?? null,
                canManageServer: hasPlexFeature(providers, "manage"),
            });
        } catch (err) {
            console.log(err);
            set({ canManageServer: false });
        }
    },
    reset: () => set({ PlexServer: null, canManageServer: false }),
}));
