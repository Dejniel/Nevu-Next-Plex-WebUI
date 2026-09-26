import axios from "axios";
import { create } from "zustand";
import {
  AuthStorage,
  HomeProfile,
} from "../auth/AuthStorage";
import {
  getHomeProfiles,
  getPlexUser,
  resolveServerToken,
  switchHomeProfile,
  validateServerToken,
} from "../plex/auth";
import { useSyncSessionState } from "./SyncSessionState";
import { useUserSessionStore } from "./UserSession";
import { useUserSettings } from "./UserSettingsState";
import { useWatchListCache } from "./WatchListCache";

export type AuthStatus =
  | "initializing"
  | "signedOut"
  | "selectingProfile"
  | "unlocking"
  | "ready"
  | "error";

interface AuthSessionState {
  status: AuthStatus;
  profiles: HomeProfile[];
  ownerUser: Plex.UserData | null;
  activeProfile: HomeProfile | null;
  rememberProfile: boolean;
  error: string | null;
  initialize: () => Promise<void>;
  completeAccountLogin: (token: string) => Promise<void>;
  selectProfile: (profile: HomeProfile, pin?: string) => Promise<boolean>;
  switchProfile: () => Promise<void>;
  signOut: () => void;
  setRememberProfile: (enabled: boolean) => void;
}

function resetProfileState() {
  useSyncSessionState.getState().disconnect();
  useUserSessionStore.getState().reset();
  useUserSettings.getState().reset();
  useWatchListCache.getState().reset();
}

function profileFromUser(
  user: Plex.UserData,
  ownerUser: Plex.UserData,
): HomeProfile {
  return {
    id: Number(user.id),
    title: user.friendlyName || user.title || user.username,
    username: user.username || undefined,
    thumb: user.thumb || undefined,
    protected: Boolean(user.protected),
    restricted: Boolean(user.restricted),
    isOwner: Number(user.id) === Number(ownerUser.id),
  };
}

function profileError(error: unknown): string {
  if (axios.isAxiosError(error) && error.response?.status === 401)
    return "Incorrect PIN.";
  if (error instanceof Error) return error.message;
  return "Unable to switch Plex profile.";
}

export const useAuthSession = create<AuthSessionState>((set, get) => ({
  status: "initializing",
  profiles: [],
  ownerUser: null,
  activeProfile: null,
  rememberProfile: AuthStorage.getRememberProfile(),
  error: null,

  initialize: async () => {
    set({ status: "initializing", error: null });
    AuthStorage.migrateLegacySession();

    const ownerToken = AuthStorage.getOwnerToken();
    if (!ownerToken) {
      set({ status: "signedOut", ownerUser: null, activeProfile: null });
      return;
    }

    let ownerUser: Plex.UserData | null;
    try {
      ownerUser = await getPlexUser(ownerToken);
    } catch (error) {
      set({ status: "error", error: profileError(error) });
      return;
    }

    if (!ownerUser) {
      AuthStorage.clearAll();
      set({ status: "signedOut", ownerUser: null, activeProfile: null });
      return;
    }

    const activeSession = AuthStorage.getActiveSession();
    if (activeSession) {
      try {
        const activeUser = await getPlexUser(activeSession.accountToken);
        if (activeUser) {
          let serverToken = activeSession.serverToken;
          if (!(await validateServerToken(serverToken)))
            serverToken = await resolveServerToken(activeSession.accountToken);

          const activeProfile =
            activeSession.profile ?? profileFromUser(activeUser, ownerUser);
          AuthStorage.saveActiveSession({
            profile: activeProfile,
            accountToken: activeSession.accountToken,
            serverToken,
          });
          set({
            status: "ready",
            ownerUser,
            activeProfile,
            rememberProfile: AuthStorage.getRememberProfile(),
          });
          return;
        }
      } catch (error) {
        set({ status: "error", error: profileError(error), ownerUser });
        return;
      }
      AuthStorage.clearActiveSession();
    }

    try {
      const profiles = await getHomeProfiles(ownerToken, ownerUser);
      set({
        profiles,
        ownerUser,
        activeProfile: null,
        rememberProfile: AuthStorage.getRememberProfile(),
        status: "selectingProfile",
      });

      if (profiles.length === 1 && !profiles[0].protected)
        await get().selectProfile(profiles[0]);
    } catch (error) {
      set({ status: "error", error: profileError(error), ownerUser });
    }
  },

  completeAccountLogin: async (token) => {
    AuthStorage.setOwnerToken(token);
    AuthStorage.clearActiveSession();
    await get().initialize();
  },

  selectProfile: async (profile, pin) => {
    const ownerToken = AuthStorage.getOwnerToken();
    if (!ownerToken) {
      set({ status: "signedOut" });
      return false;
    }

    set({ status: "unlocking", error: null });
    try {
      const accountToken = await switchHomeProfile(ownerToken, profile, pin);
      const serverToken = await resolveServerToken(accountToken);
      AuthStorage.saveActiveSession({ profile, accountToken, serverToken });
      resetProfileState();
      set({ status: "ready", activeProfile: profile, error: null });
      return true;
    } catch (error) {
      set({ status: "selectingProfile", error: profileError(error) });
      return false;
    }
  },

  switchProfile: async () => {
    resetProfileState();
    AuthStorage.clearActiveSession();
    set({ status: "initializing", activeProfile: null, error: null });

    const ownerToken = AuthStorage.getOwnerToken();
    if (!ownerToken) {
      get().signOut();
      return;
    }

    try {
      const ownerUser = get().ownerUser ?? (await getPlexUser(ownerToken));
      if (!ownerUser) {
        get().signOut();
        return;
      }
      const profiles = await getHomeProfiles(ownerToken, ownerUser);
      set({ status: "selectingProfile", profiles, ownerUser });
    } catch (error) {
      set({ status: "error", error: profileError(error) });
    }
  },

  signOut: () => {
    resetProfileState();
    AuthStorage.clearAll();
    set({
      status: "signedOut",
      profiles: [],
      ownerUser: null,
      activeProfile: null,
      error: null,
    });
  },

  setRememberProfile: (enabled) => {
    AuthStorage.setRememberProfile(enabled);
    set({ rememberProfile: enabled });
  },
}));
