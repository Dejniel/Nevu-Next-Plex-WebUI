import { AuthStorage, HomeProfile } from "../auth/AuthStorage";
import {
  getHomeProfiles,
  getPlexUser,
  resolveServerToken,
  switchHomeProfile,
} from "../plex/auth";
import { useAuthSession } from "./AuthSessionState";

jest.mock("../plex/auth", () => ({
  getHomeProfiles: jest.fn(),
  getPlexUser: jest.fn(),
  resolveServerToken: jest.fn(),
  switchHomeProfile: jest.fn(),
  validateServerToken: jest.fn(),
}));
jest.mock("./SyncSessionState", () => ({
  useSyncSessionState: { getState: () => ({ disconnect: jest.fn() }) },
}));
jest.mock("./UserSession", () => ({
  useUserSessionStore: { getState: () => ({ reset: jest.fn() }) },
}));
jest.mock("./UserSettingsState", () => ({
  useUserSettings: { getState: () => ({ reset: jest.fn() }) },
}));
jest.mock("./WatchListCache", () => ({
  useWatchListCache: { getState: () => ({ reset: jest.fn() }) },
}));
jest.mock("./SessionState", () => ({
  useSessionStore: {
    getState: () => ({ reset: jest.fn(), fetchPlexServer: jest.fn() }),
  },
}));
jest.mock("./LibrariesState", () => ({
  useLibraries: { getState: () => ({ reset: jest.fn() }) },
}));

const owner = {
  id: 1,
  title: "Owner",
  protected: true,
  restricted: false,
} as Plex.UserData;
const profile: HomeProfile = {
  id: 2,
  title: "Home user",
  protected: true,
  restricted: true,
  isOwner: false,
};

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  jest.clearAllMocks();
  useAuthSession.setState({
    status: "initializing",
    profiles: [],
    ownerUser: null,
    activeProfile: null,
    rememberProfile: true,
    error: null,
    clearError: useAuthSession.getState().clearError,
  });
});

describe("AuthSessionState", () => {
  it("shows the profile picker after validating the owner", async () => {
    AuthStorage.setOwnerToken("owner-token");
    (getPlexUser as jest.Mock).mockResolvedValue(owner);
    (getHomeProfiles as jest.Mock).mockResolvedValue([profile]);

    await useAuthSession.getState().initialize();

    expect(useAuthSession.getState().status).toBe("selectingProfile");
    expect(useAuthSession.getState().profiles).toEqual([profile]);
  });

  it("stores the selected Home profile as one active session", async () => {
    AuthStorage.setOwnerToken("owner-token");
    (switchHomeProfile as jest.Mock).mockResolvedValue("profile-token");
    (resolveServerToken as jest.Mock).mockResolvedValue("server-token");

    await expect(
      useAuthSession.getState().selectProfile(profile, "1234"),
    ).resolves.toBe(true);

    expect(useAuthSession.getState().status).toBe("ready");
    expect(AuthStorage.getActiveSession()).toEqual({
      profile,
      accountToken: "profile-token",
      serverToken: "server-token",
    });
  });

  it("keeps saved credentials when Plex is temporarily unavailable", async () => {
    AuthStorage.setOwnerToken("owner-token");
    (getPlexUser as jest.Mock).mockRejectedValue(new Error("Network Error"));

    await useAuthSession.getState().initialize();

    expect(useAuthSession.getState().status).toBe("error");
    expect(AuthStorage.getOwnerToken()).toBe("owner-token");
    expect(useAuthSession.getState().error).toContain("verify the Plex account");
  });

  it("clears an expired account and explains why sign-in is required", async () => {
    AuthStorage.setOwnerToken("expired-token");
    (getPlexUser as jest.Mock).mockResolvedValue(null);

    await useAuthSession.getState().initialize();

    expect(useAuthSession.getState().status).toBe("error");
    expect(useAuthSession.getState().error).toContain("session has expired");
    expect(AuthStorage.getOwnerToken()).toBeNull();
  });
});
