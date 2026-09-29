import { APP_VERSION } from "appVersion";
import {
  getBrowserName,
  getBrowserVersion,
  getScreenResolution,
  platformCache,
} from "shared/lib/platform";
import { PlexClient, PlexRequestError } from "shared/api/PlexClient";
import { AuthStorage } from "./authStorage";
import { useServerSession } from "./serverSession";

export { PlexRequestError };

export const plexClient = new PlexClient(() => AuthStorage.getServerToken());

export function authedGetStrict(url: string) {
  return plexClient.get(url);
}

export async function authedGet(url: string) {
  try {
    return await authedGetStrict(url);
  } catch {
    return null;
  }
}

export function authedPost(url: string, body?: unknown) {
  return plexClient.post(url, body).catch(() => null);
}

export function authedPut(url: string, body: unknown) {
  return plexClient.put(url, body).catch(() => null);
}

export function getXPlexProps() {
  const serverSession = useServerSession.getState();
  const desktop = Boolean(platformCache.platform?.platform);

  return {
    "X-Incomplete-Segments": "1",
    "X-Plex-Product": desktop ? "Nevu Desktop" : "Nevu Web",
    "X-Plex-Version": APP_VERSION,
    "X-Plex-Client-Identifier": localStorage.getItem("clientID"),
    "X-Plex-Platform": platformCache.platform?.platform ?? getBrowserName(),
    "X-Plex-Platform-Version":
      platformCache.platform?.version ?? getBrowserVersion(),
    "X-Plex-Features": "external-media,indirect-media,hub-style-list",
    "X-Plex-Model": "bundled",
    "X-Plex-Device": desktop ? "Chrome" : getBrowserName(),
    "X-Plex-Device-Name": platformCache.deviceName || "Nevu Web",
    "X-Plex-Device-Screen-Resolution": getScreenResolution(),
    "X-Plex-Token": AuthStorage.getServerToken(),
    "X-Plex-Language": "en",
    "X-Plex-Session-Id": sessionStorage.getItem("sessionID"),
    "X-Plex-Session-Identifier": serverSession.plexSessionID,
    session: serverSession.sessionID,
  };
}
