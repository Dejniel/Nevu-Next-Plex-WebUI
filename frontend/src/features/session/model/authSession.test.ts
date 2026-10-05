import type { Mock } from "vitest";
import {
  getHomeProfiles,
  getPlexUser,
  resolveServerToken,
  switchHomeProfile,
  validateServerToken,
} from "../api/plexAuth";
import { AuthStorage, HomeProfile } from "./authStorage";
import { useAuthSession } from "./authSession";

vi.mock("../api/plexAuth", () => ({
  getHomeProfiles: vi.fn(),
  getPlexUser: vi.fn(),
  resolveServerToken: vi.fn(),
  switchHomeProfile: vi.fn(),
  validateServerToken: vi.fn(),
}));

const owner = {
  id: 1,
  uuid: "owner",
  title: "Owner",
  protected: true,
  restricted: false,
} as Plex.UserData;
const member = {
  id: 2,
  uuid: "member",
  title: "Home user",
  protected: true,
  restricted: true,
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
  vi.resetAllMocks();
  useAuthSession.setState({
    status: "initializing",
    profiles: [],
    ownerUser: null,
    activeProfile: null,
    activeUser: null,
    revision: 0,
    rememberProfile: true,
    error: null,
  });
});

describe("auth session", () => {
  it("shows the profile picker after validating the owner", async () => {
    AuthStorage.setOwnerToken("owner-token");
    (getPlexUser as Mock).mockResolvedValue(owner);
    (getHomeProfiles as Mock).mockResolvedValue([profile]);

    await useAuthSession.getState().initialize();

    expect(useAuthSession.getState().status).toBe("selectingProfile");
    expect(useAuthSession.getState().profiles).toEqual([profile]);
  });

  it("stores the selected Home profile and its active user", async () => {
    AuthStorage.setOwnerToken("owner-token");
    (switchHomeProfile as Mock).mockResolvedValue("profile-token");
    (resolveServerToken as Mock).mockResolvedValue("server-token");
    (getPlexUser as Mock).mockResolvedValue(member);

    await expect(
      useAuthSession.getState().selectProfile(profile, "1234"),
    ).resolves.toBe(true);

    expect(useAuthSession.getState()).toMatchObject({
      status: "ready",
      activeProfile: profile,
      activeUser: member,
      revision: 1,
    });
    expect(AuthStorage.getActiveSession()).toEqual({
      profile,
      accountToken: "profile-token",
      serverToken: "server-token",
    });
  });

  it("restores a remembered session and renews an invalid server token", async () => {
    AuthStorage.setOwnerToken("owner-token");
    AuthStorage.saveActiveSession({
      profile,
      accountToken: "profile-token",
      serverToken: "old-server-token",
    });
    (getPlexUser as Mock)
      .mockResolvedValueOnce(owner)
      .mockResolvedValueOnce(member);
    (validateServerToken as Mock).mockResolvedValue(false);
    (resolveServerToken as Mock).mockResolvedValue("new-server-token");

    await useAuthSession.getState().initialize();

    expect(useAuthSession.getState()).toMatchObject({
      status: "ready",
      activeUser: member,
      revision: 1,
    });
    expect(AuthStorage.getServerToken()).toBe("new-server-token");
  });

  it("keeps saved credentials when Plex is temporarily unavailable", async () => {
    AuthStorage.setOwnerToken("owner-token");
    (getPlexUser as Mock).mockRejectedValue(new Error("Network Error"));

    await useAuthSession.getState().initialize();

    expect(useAuthSession.getState().status).toBe("error");
    expect(AuthStorage.getOwnerToken()).toBe("owner-token");
    expect(useAuthSession.getState().error).toContain("verify the Plex account");
  });

  it("clears an expired account and explains why sign-in is required", async () => {
    AuthStorage.setOwnerToken("expired-token");
    (getPlexUser as Mock).mockResolvedValue(null);

    await useAuthSession.getState().initialize();

    expect(useAuthSession.getState().status).toBe("error");
    expect(useAuthSession.getState().error).toContain("session has expired");
    expect(AuthStorage.getOwnerToken()).toBeNull();
  });
});
