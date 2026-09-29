import { randomId, uuidV4 } from "shared/lib/identifiers";
import { getDeviceName, getPlatform, platformCache } from "shared/lib/platform";

async function detectPlatform() {
  const platformData = await getPlatform();
  if (!platformData) return;

  platformData.platform =
    platformData.platform.charAt(0).toUpperCase() +
    platformData.platform.slice(1).toLowerCase();

  if (platformData.platform === "Win32") platformData.platform = "Windows";

  platformCache.platform = platformData;
  platformCache.deviceName = await getDeviceName();
  platformCache.isDesktop = true;
  console.log("Platform detected:", platformCache.platform);
}

export function initializeRuntime() {
  if (!localStorage.getItem("clientID")) {
    localStorage.setItem("clientID", randomId(24));
  }

  sessionStorage.setItem("sessionID", uuidV4());

  if (!localStorage.getItem("quality")) {
    localStorage.setItem("quality", "12000");
  }

  void detectPlatform();
}
