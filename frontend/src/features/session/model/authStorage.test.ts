import { ActivePlexSession, AuthStorage } from "./authStorage";

const session: ActivePlexSession = {
  profile: {
    id: 1,
    title: "Profile",
    protected: false,
    restricted: false,
    isOwner: true,
  },
  accountToken: "account-token",
  serverToken: "server-token",
};

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe("AuthStorage", () => {
  it("remembers the selected profile by default", () => {
    AuthStorage.saveActiveSession(session);

    expect(AuthStorage.getRememberProfile()).toBe(true);
    expect(AuthStorage.getActiveSession()).toEqual(session);
    expect(sessionStorage.length).toBe(0);
  });

  it("moves the active session when remember profile changes", () => {
    AuthStorage.saveActiveSession(session);

    AuthStorage.setRememberProfile(false);

    expect(AuthStorage.getActiveSession()).toEqual(session);
    expect(localStorage.getItem("nevu.auth.activeSession")).toBeNull();
    expect(sessionStorage.getItem("nevu.auth.activeSession")).not.toBeNull();
  });

  it("migrates the existing Nevu tokens", () => {
    localStorage.setItem("accAccessToken", "old-account-token");
    localStorage.setItem("accessToken", "old-server-token");

    AuthStorage.migrateLegacySession();

    expect(AuthStorage.getOwnerToken()).toBe("old-account-token");
    expect(AuthStorage.getProfileAccountToken()).toBe("old-account-token");
    expect(AuthStorage.getServerToken()).toBe("old-server-token");
    expect(localStorage.getItem("accAccessToken")).toBeNull();
    expect(localStorage.getItem("accessToken")).toBeNull();
  });
});
