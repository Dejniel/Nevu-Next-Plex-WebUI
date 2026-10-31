import type { MediaMetadata } from "plex/media";
import axios from "axios";
import { AuthStorage } from "features/session/model";
import { getBackendURL } from "shared/api/backend";
import {
  getDiscoverID,
  type DiscoverExtra,
  type TitleExtra,
} from "../model/mediaExtras";
import type { VideoSource } from "shared/lib/video/types";
import { readDiscoverExtras, readDiscoverStream } from "./mediaExtrasResponses";

function discoverHeaders() {
  return {
    "X-Plex-Token": AuthStorage.getProfileAccountToken() || "",
    "X-Plex-Client-Identifier": localStorage.getItem("clientID") || "nevu-web",
  };
}

export async function fetchDiscoverExtras(
  item: Partial<Pick<MediaMetadata, "guid" | "Guid">>,
  signal?: AbortSignal,
): Promise<DiscoverExtra[]> {
  signal?.throwIfAborted();
  const discoverID = getDiscoverID(item);
  if (!discoverID || !AuthStorage.getProfileAccountToken()) return [];

  const path = `/library/metadata/${discoverID}/extras`;
  const response = await axios.post<unknown>(
    `${getBackendURL()}/discover/extras`,
    { path },
    { headers: discoverHeaders(), signal },
  );
  signal?.throwIfAborted();
  return readDiscoverExtras(response.data);
}

function getPlayablePart(extra: DiscoverExtra) {
  const parts = extra.Media?.flatMap((media) => media.Part || []) ?? [];
  return (
    parts.find((part) => part.key?.split("?")[0].endsWith("/parts/hls.m3u8")) ??
    null
  );
}

export async function resolveDiscoverExtra(
  extra: Extract<TitleExtra, { source: "discover" }>,
  signal?: AbortSignal,
): Promise<VideoSource> {
  signal?.throwIfAborted();
  const part = getPlayablePart(extra.metadata);
  if (!part?.key)
    throw new Error("This extra does not have a playable stream.");

  const response = await axios
    .post<unknown>(
      `${getBackendURL()}/discover/stream`,
      { path: part.key.split("?")[0] },
      { headers: discoverHeaders(), signal },
    )
    .catch((reason: unknown) => {
      signal?.throwIfAborted();
      const status = axios.isAxiosError(reason)
        ? reason.response?.status
        : null;
      throw new Error(
        `Plex Discover could not prepare this extra${status ? ` (HTTP ${status})` : ""}. Please try again.`,
      );
    });
  signal?.throwIfAborted();
  return { id: part.key, url: readDiscoverStream(response.data), type: "hls" };
}
