import axios from "axios";
import { AuthStorage } from "features/session/model";
import { getBackendURL } from "shared/api/backend";
import { getDiscoverID, TitleExtra } from "../model/mediaExtras";
import type { VideoSource } from "shared/lib/video/types";

function discoverHeaders() {
  return {
    "X-Plex-Token": AuthStorage.getProfileAccountToken() || "",
    "X-Plex-Client-Identifier": localStorage.getItem("clientID") || "nevu-web",
  };
}

export async function fetchDiscoverExtras(
  item: Partial<Pick<Plex.Metadata, "guid" | "Guid">>,
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

function getPlayablePart(extra: Plex.Metadata): Plex.Part | null {
  const parts = extra.Media?.flatMap((media) => media.Part || []) ?? [];
  return (
    parts.find((part) => part.key?.split("?")[0].endsWith("/parts/hls.m3u8")) ??
    null
  );
}

export async function resolveDiscoverExtra(
  extra: TitleExtra,
): Promise<VideoSource> {
  const part = getPlayablePart(extra.metadata);
  if (!part?.key)
    throw new Error("This extra does not have a playable stream.");

  const response = await axios.post(
    `${getBackendURL()}/discover/stream`,
    { path: part.key.split("?")[0] },
    { headers: discoverHeaders() },
  );
  if (!response.data?.url)
    throw new Error("Plex Discover did not return a stream.");
  return { id: part.key, url: response.data.url, type: "hls" };
}
