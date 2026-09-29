import axios from "axios";
import { AuthStorage } from "features/session/model";
import { queryBuilder } from "plex/QuickFunctions";
import { getBackendURL } from "shared/api/backend";
import { getDiscoverID, TitleExtra } from "../model/titleExtras";

function discoverHeaders() {
  return {
    "X-Plex-Token": AuthStorage.getProfileAccountToken() || "",
    "X-Plex-Client-Identifier": localStorage.getItem("clientID") || "nevu-web",
  };
}

export async function fetchDiscoverExtras(
  item: Plex.Metadata,
): Promise<Plex.Metadata[]> {
  const discoverID = getDiscoverID(item);
  if (!discoverID || !AuthStorage.getProfileAccountToken()) return [];

  const path = `/library/metadata/${discoverID}/extras`;
  const response = await axios.post(
    `${getBackendURL()}/discover/extras`,
    { path },
    { headers: discoverHeaders() },
  );
  return response.data?.MediaContainer?.Metadata ?? [];
}

function getPlayablePart(
  extra: Plex.Metadata,
  requireHLS = false,
): Plex.Part | null {
  const parts = extra.Media?.flatMap((media) => media.Part || []) ?? [];
  const hls = parts.find((part) =>
    part.key?.split("?")[0].endsWith("/parts/hls.m3u8"),
  );
  return hls ?? (requireHLS ? null : parts[0] ?? null);
}

export async function resolveExtraURL(extra: TitleExtra): Promise<string> {
  const part = getPlayablePart(extra.metadata, extra.source === "discover");
  if (!part?.key) throw new Error("This extra does not have a playable stream.");

  if (extra.source === "local") {
    return `${getBackendURL()}/dynproxy${part.key.split("?")[0]}?${queryBuilder({
      "X-Plex-Token": AuthStorage.getServerToken(),
      ...Object.fromEntries(
        new URL("http://plex.local" + part.key).searchParams.entries(),
      ),
    })}`;
  }

  const response = await axios.post(
    `${getBackendURL()}/discover/stream`,
    { path: part.key.split("?")[0] },
    { headers: discoverHeaders() },
  );
  if (!response.data?.url) throw new Error("Plex Discover did not return a stream.");
  return response.data.url;
}
