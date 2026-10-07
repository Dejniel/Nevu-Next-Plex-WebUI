import { create } from "zustand";
import { serverQueryClient } from "shared/api/queryClient";
import {
  getHomeProfiles,
  getPlexUser,
  resolveServerToken,
  switchHomeProfile,
  validateServerToken,
} from "../api/plexAuth";
import { authErrorMessage } from "./authError";
import { AuthStorage, HomeProfile } from "./authStorage";
import { useServerSession } from "./serverSession";
import { homeProfiles } from "./plexHome";
import type { PlexHomeMember } from "./plexHome";

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
  activeUser: Plex.UserData | null;
  revision: number;
  rememberProfile: boolean;
  error: string | null;
  initialize: () => Promise<void>;
  completeAccountLogin: (token: string) => Promise<void>;
  selectProfile: (profile: HomeProfile, pin?: string) => Promise<boolean>;
  switchProfile: () => Promise<void>;
  signOut: () => void;
  setRememberProfile: (enabled: boolean) => void;
  clearError: () => void;
  updateHomeProfiles: (members: PlexHomeMember[], revision: number) => void;
}

let operationGeneration = 0;

function resetSessionData() {
  serverQueryClient.clear();
  useServerSession.getState().reset();
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

export const useAuthSession = create<AuthSessionState>((set, get) => ({
  status: "initializing",
  profiles: [],
  ownerUser: null,
  activeProfile: null,
  activeUser: null,
  revision: 0,
  rememberProfile: AuthStorage.getRememberProfile(),
  error: null,

  initialize: async () => {
    const generation = ++operationGeneration;
    set({ status: "initializing", error: null });

    const ownerToken = AuthStorage.getOwnerToken();
    if (!ownerToken) {
      resetSessionData();
      set({
        status: "signedOut",
        profiles: [],
        ownerUser: null,
        activeProfile: null,
        activeUser: null,
      });
      return;
    }

    let ownerUser: Plex.UserData | null;
    try {
      ownerUser = await getPlexUser(ownerToken);
    } catch (error) {
      if (generation === operationGeneration)
        set({ status: "error", error: authErrorMessage(error, "account") });
      return;
    }
    if (generation !== operationGeneration) return;

    if (!ownerUser) {
      AuthStorage.clearAll();
      resetSessionData();
      set({
        status: "error",
        error: "The saved Plex session has expired. Sign in again.",
        profiles: [],
        ownerUser: null,
        activeProfile: null,
        activeUser: null,
      });
      return;
    }

    const activeSession = AuthStorage.getActiveSession();
    if (activeSession) {
      try {
        const activeUser = await getPlexUser(activeSession.accountToken);
        if (generation !== operationGeneration) return;

        if (activeUser) {
          let serverToken = activeSession.serverToken;
          if (!(await validateServerToken(serverToken)))
            serverToken = await resolveServerToken(activeSession.accountToken);
          if (generation !== operationGeneration) return;

          const activeProfile =
            activeSession.profile ?? profileFromUser(activeUser, ownerUser);
          AuthStorage.saveActiveSession({
            profile: activeProfile,
            accountToken: activeSession.accountToken,
            serverToken,
          });
          resetSessionData();
          set((state) => ({
            status: "ready",
            ownerUser,
            activeProfile,
            activeUser,
            revision: state.revision + 1,
            rememberProfile: AuthStorage.getRememberProfile(),
            error: null,
          }));
          return;
        }
      } catch (error) {
        if (generation === operationGeneration)
          set({
            status: "error",
            error: authErrorMessage(error, "server"),
            ownerUser,
          });
        return;
      }
      AuthStorage.clearActiveSession();
      resetSessionData();
    }

    try {
      const profiles = await getHomeProfiles(ownerToken, ownerUser);
      if (generation !== operationGeneration) return;
      set({
        profiles,
        ownerUser,
        activeProfile: null,
        activeUser: null,
        rememberProfile: AuthStorage.getRememberProfile(),
        status: "selectingProfile",
      });

      if (profiles.length === 1 && !profiles[0].protected)
        await get().selectProfile(profiles[0]);
    } catch (error) {
      if (generation === operationGeneration)
        set({
          status: "error",
          error: authErrorMessage(error, "profiles"),
          ownerUser,
        });
    }
  },

  completeAccountLogin: async (token) => {
    AuthStorage.setOwnerToken(token);
    AuthStorage.clearActiveSession();
    resetSessionData();
    await get().initialize();
  },

  selectProfile: async (profile, pin) => {
    const generation = ++operationGeneration;
    const ownerToken = AuthStorage.getOwnerToken();
    if (!ownerToken) {
      set({ status: "signedOut" });
      return false;
    }

    set({ status: "unlocking", error: null });
    let accountToken: string;
    try {
      accountToken = await switchHomeProfile(ownerToken, profile, pin);
    } catch (error) {
      if (generation === operationGeneration)
        set({
          status: "selectingProfile",
          error: authErrorMessage(error, "profile"),
        });
      return false;
    }

    try {
      const [serverToken, activeUser] = await Promise.all([
        resolveServerToken(accountToken),
        getPlexUser(accountToken),
      ]);
      if (generation !== operationGeneration) return false;
      if (!activeUser)
        throw new Error("The selected Plex profile is no longer available.");

      AuthStorage.saveActiveSession({ profile, accountToken, serverToken });
      resetSessionData();
      set((state) => ({
        status: "ready",
        activeProfile: profile,
        activeUser,
        revision: state.revision + 1,
        error: null,
      }));
      return true;
    } catch (error) {
      if (generation === operationGeneration)
        set({
          status: "selectingProfile",
          error: authErrorMessage(error, "server"),
        });
      return false;
    }
  },

  switchProfile: async () => {
    const generation = ++operationGeneration;
    resetSessionData();
    AuthStorage.clearActiveSession();
    set({
      status: "initializing",
      activeProfile: null,
      activeUser: null,
      error: null,
    });

    const ownerToken = AuthStorage.getOwnerToken();
    if (!ownerToken) {
      get().signOut();
      return;
    }

    try {
      const ownerUser = get().ownerUser ?? (await getPlexUser(ownerToken));
      if (generation !== operationGeneration) return;
      if (!ownerUser) {
        get().signOut();
        return;
      }
      const profiles = await getHomeProfiles(ownerToken, ownerUser);
      if (generation !== operationGeneration) return;
      set({ status: "selectingProfile", profiles, ownerUser });

      if (profiles.length === 1 && !profiles[0].protected)
        await get().selectProfile(profiles[0]);
    } catch (error) {
      if (generation === operationGeneration)
        set({ status: "error", error: authErrorMessage(error, "profiles") });
    }
  },

  signOut: () => {
    operationGeneration += 1;
    resetSessionData();
    AuthStorage.clearAll();
    set({
      status: "signedOut",
      profiles: [],
      ownerUser: null,
      activeProfile: null,
      activeUser: null,
      error: null,
    });
  },

  setRememberProfile: (enabled) => {
    AuthStorage.setRememberProfile(enabled);
    set({ rememberProfile: enabled });
  },

  clearError: () => set({ error: null }),

  updateHomeProfiles: (members, revision) => {
    const state = get();
    if (
      state.status !== "ready" ||
      state.revision !== revision ||
      !state.ownerUser
    )
      return;
    const profiles = homeProfiles(members, Number(state.ownerUser.id));
    const activeProfile = profiles.find(
      (profile) => profile.id === state.activeProfile?.id,
    );
    const session = AuthStorage.getActiveSession();
    if (activeProfile && session)
      AuthStorage.saveActiveSession({ ...session, profile: activeProfile });
    set({
      profiles,
      ...(activeProfile && {
        activeProfile,
        activeUser: state.activeUser
          ? { ...state.activeUser, protected: activeProfile.protected }
          : null,
      }),
    });
  },
}));
