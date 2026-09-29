import axios from "axios";
import { XMLParser } from "fast-xml-parser";
import { ProxiedRequest } from "shared/api/backend";
import { APP_VERSION } from "appVersion";
import type { HomeProfile } from "../model/authStorage";

const xmlParser = new XMLParser({
  attributeNamePrefix: "",
  textNodeName: "value",
  ignoreAttributes: false,
  parseAttributeValue: true,
});

export interface PlexAuthUrlOptions {
  clientIdentifier: string;
  pinCode: string;
  forwardUrl: string;
}

function getClientIdentifier(): string {
  return localStorage.getItem("clientID") ?? "nevu-web";
}

function plexHeaders(token?: string, accept = "application/json") {
  return {
    Accept: accept,
    "X-Plex-Product": "NEVU",
    "X-Plex-Version": APP_VERSION,
    "X-Plex-Client-Identifier": getClientIdentifier(),
    ...(token ? { "X-Plex-Token": token } : {}),
  };
}

function queryString(values: Record<string, string | number | boolean | null>) {
  const query = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== null) query.set(key, String(value));
  });
  return query.toString();
}

function parseBoolean(value: unknown): boolean {
  return value === true || value === 1 || value === "1" || value === "true";
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function parseXml(data: unknown): any {
  return typeof data === "string" ? xmlParser.parse(data) : data;
}

export function buildPlexAuthUrl({
  clientIdentifier,
  pinCode,
  forwardUrl,
}: PlexAuthUrlOptions): string {
  const params = new URLSearchParams({
    clientID: clientIdentifier,
    code: pinCode,
    "context[device][product]": "NEVU",
    forwardUrl,
  });

  return `https://app.plex.tv/auth#?${params.toString()}`;
}

export async function getAccessToken(pin: string): Promise<Plex.TokenData> {
  const res = await axios.get(
    `https://plex.tv/api/v2/pins/${pin}?${queryString({
      "X-Plex-Client-Identifier": getClientIdentifier(),
    })}`,
    { headers: { Accept: "application/json" } },
  );
  return res.data;
}

export async function getPin(): Promise<Plex.TokenData> {
  const res = await axios.post(
    `https://plex.tv/api/v2/pins?${queryString({
      strong: true,
      "X-Plex-Client-Identifier": getClientIdentifier(),
      "X-Plex-Product": "NEVU",
    })}`,
    undefined,
    { headers: { Accept: "application/json" } },
  );
  return res.data;
}

export async function getPlexUser(token: string): Promise<Plex.UserData | null> {
  try {
    const res = await axios.get("https://plex.tv/api/v2/user", {
      headers: plexHeaders(token),
    });
    return {
      ...res.data,
      authToken: res.data.authToken ?? token,
    };
  } catch (error) {
    if (
      axios.isAxiosError(error) &&
      (error.response?.status === 401 || error.response?.status === 403)
    ) {
      return null;
    }
    throw error;
  }
}

export async function getHomeProfiles(
  ownerToken: string,
  owner?: Plex.UserData,
): Promise<HomeProfile[]> {
  const ownerUser = owner ?? (await getPlexUser(ownerToken));
  if (!ownerUser) throw new Error("The Plex account token is no longer valid.");

  const response = await axios.get("https://plex.tv/api/users", {
    headers: plexHeaders(ownerToken, "application/xml"),
  });
  const users = asArray<any>(parseXml(response.data)?.MediaContainer?.User)
    .filter((user) => parseBoolean(user.home))
    .map<HomeProfile>((user) => ({
      id: Number(user.id),
      title: user.title || user.username || "Plex Home user",
      username: user.username || undefined,
      thumb: user.thumb || undefined,
      protected: parseBoolean(user.protected),
      restricted: parseBoolean(user.restricted),
      isOwner: false,
    }));

  const ownerProfile: HomeProfile = {
    id: Number(ownerUser.id),
    title:
      ownerUser.friendlyName ||
      ownerUser.title ||
      ownerUser.username ||
      "Plex Home owner",
    username: ownerUser.username || undefined,
    thumb: ownerUser.thumb || undefined,
    protected: Boolean(ownerUser.protected),
    restricted: Boolean(ownerUser.restricted),
    isOwner: true,
  };

  return [ownerProfile, ...users.filter((user) => user.id !== ownerProfile.id)];
}

export async function switchHomeProfile(
  ownerToken: string,
  profile: HomeProfile,
  pin?: string,
): Promise<string> {
  if (profile.isOwner && !profile.protected) return ownerToken;

  const response = await axios.post(
    `https://plex.tv/api/home/users/${profile.id}/switch?${queryString({
      pin: pin || null,
    })}`,
    undefined,
    { headers: plexHeaders(ownerToken, "application/xml") },
  );
  const parsed = parseXml(response.data);
  const user = parsed?.user ?? parsed?.User;
  const token = user?.authenticationToken;
  if (!token) throw new Error("Plex did not return a profile token.");
  return String(token);
}

async function getServerMachineIdentifier(token: string): Promise<string> {
  const response = await ProxiedRequest("/identity", "GET", {
    "X-Plex-Token": token,
    Accept: "application/json",
  });
  const identifier = response.data?.MediaContainer?.machineIdentifier;
  if (response.status >= 500)
    throw new Error("Nevu cannot reach the configured Plex server.");
  if (response.status !== 200 || !identifier)
    throw new Error("The selected profile cannot access this Plex server.");
  return identifier;
}

export async function resolveServerToken(accountToken: string): Promise<string> {
  const machineIdentifier = await getServerMachineIdentifier(accountToken);
  const response = await axios.get(
    "https://plex.tv/api/resources?includeHttps=1&includeRelay=1&includeIPv6=1",
    { headers: plexHeaders(accountToken, "application/xml") },
  );
  const devices = asArray<any>(parseXml(response.data)?.MediaContainer?.Device);
  const server = devices.find(
    (device) => device.clientIdentifier === machineIdentifier,
  );
  if (!server?.accessToken)
    throw new Error("The selected profile does not have access to this server.");
  return String(server.accessToken);
}

export async function validateServerToken(token: string): Promise<boolean> {
  try {
    await getServerMachineIdentifier(token);
    return true;
  } catch {
    return false;
  }
}
