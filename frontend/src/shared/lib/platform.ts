export interface DesktopPlatformVersion {
  appVersion: string;
  arch: string;
  platform: string;
  version: string;
}

interface ElectronBridge {
  getPlatform(): Promise<DesktopPlatformVersion>;
  getDeviceName(): Promise<string>;
}

function electronBridge() {
  return (window as Window & { electronAPI?: ElectronBridge }).electronAPI;
}

export function getBrowserName(userAgent = navigator.userAgent) {
  if (userAgent.includes("Firefox/")) return "Firefox";
  if (userAgent.includes("Edg/")) return "Edge";
  if (userAgent.includes("OPR/")) return "Opera";
  if (userAgent.includes("Chrome/")) return "Chrome";
  if (userAgent.includes("Safari/") && userAgent.includes("Version/"))
    return "Safari";
  if (userAgent.includes("MSIE") || userAgent.includes("Trident/"))
    return "Internet Explorer";
  return "Unknown";
}

export function getBrowserVersion(userAgent = navigator.userAgent) {
  const match = userAgent.match(
    /(?:Firefox|Edg|OPR|Chrome|Version|MSIE)[\s/]([\d.]+)/,
  );
  return match?.[1] ?? "Unknown";
}

export function getScreenResolution() {
  return `${window.screen.width}x${window.screen.height}`;
}

export async function getPlatform(): Promise<DesktopPlatformVersion | null> {
  return electronBridge()?.getPlatform() ?? null;
}

export async function getDeviceName(): Promise<string> {
  return electronBridge()?.getDeviceName() ?? getBrowserName();
}

export const platformCache: {
  platform: DesktopPlatformVersion | null;
  deviceName: string;
  isDesktop: boolean;
} = {
  platform: null,
  deviceName: getBrowserName(),
  isDesktop: false,
};
