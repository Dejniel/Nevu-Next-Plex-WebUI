export interface HomeProfile {
  id: number;
  title: string;
  username?: string;
  thumb?: string;
  protected: boolean;
  restricted: boolean;
  isOwner: boolean;
}

export interface ActivePlexSession {
  profile: HomeProfile | null;
  accountToken: string;
  serverToken: string;
}

const OWNER_TOKEN_KEY = "nevu.auth.ownerToken";
const ACTIVE_SESSION_KEY = "nevu.auth.activeSession";
const REMEMBER_PROFILE_KEY = "nevu.auth.rememberProfile";

function parseActiveSession(value: string | null): ActivePlexSession | null {
  if (!value) return null;

  try {
    const session = JSON.parse(value) as ActivePlexSession;
    if (!session.accountToken || !session.serverToken) return null;
    return session;
  } catch {
    return null;
  }
}

function clearActiveSessionCopies() {
  localStorage.removeItem(ACTIVE_SESSION_KEY);
  sessionStorage.removeItem(ACTIVE_SESSION_KEY);
}

export const AuthStorage = {
  getOwnerToken(): string | null {
    return localStorage.getItem(OWNER_TOKEN_KEY);
  },

  setOwnerToken(token: string) {
    localStorage.setItem(OWNER_TOKEN_KEY, token);
  },

  getRememberProfile(): boolean {
    return localStorage.getItem(REMEMBER_PROFILE_KEY) !== "false";
  },

  setRememberProfile(enabled: boolean) {
    const activeSession =
      parseActiveSession(localStorage.getItem(ACTIVE_SESSION_KEY)) ??
      parseActiveSession(sessionStorage.getItem(ACTIVE_SESSION_KEY));

    localStorage.setItem(REMEMBER_PROFILE_KEY, String(enabled));
    clearActiveSessionCopies();
    if (activeSession) this.saveActiveSession(activeSession);
  },

  getActiveSession(): ActivePlexSession | null {
    const storage = this.getRememberProfile() ? localStorage : sessionStorage;
    return parseActiveSession(storage.getItem(ACTIVE_SESSION_KEY));
  },

  saveActiveSession(session: ActivePlexSession) {
    clearActiveSessionCopies();
    const storage = this.getRememberProfile() ? localStorage : sessionStorage;
    storage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(session));
  },

  clearActiveSession() {
    clearActiveSessionCopies();
  },

  getProfileAccountToken(): string | null {
    return this.getActiveSession()?.accountToken ?? null;
  },

  getServerToken(): string | null {
    return this.getActiveSession()?.serverToken ?? null;
  },

  clearAll() {
    localStorage.removeItem(OWNER_TOKEN_KEY);
    localStorage.removeItem("accAccessToken");
    localStorage.removeItem("accessToken");
    clearActiveSessionCopies();
  },

  migrateLegacySession() {
    const legacyAccountToken = localStorage.getItem("accAccessToken");
    const legacyServerToken = localStorage.getItem("accessToken");

    if (!this.getOwnerToken() && legacyAccountToken)
      this.setOwnerToken(legacyAccountToken);

    if (!this.getActiveSession() && legacyAccountToken && legacyServerToken) {
      this.saveActiveSession({
        profile: null,
        accountToken: legacyAccountToken,
        serverToken: legacyServerToken,
      });
    }

    localStorage.removeItem("accAccessToken");
    localStorage.removeItem("accessToken");
  },
};
