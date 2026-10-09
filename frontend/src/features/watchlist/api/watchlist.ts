import {
  getPlexTitleIdentity,
  readDiscoverTitle,
  type DiscoverTitle,
} from "entities/media/model";
import axios from "axios";
import { AuthStorage } from "features/session/model";
import { readPlexMetadataPages } from "shared/api/plexPagination";

const DISCOVER_URL = "https://discover.provider.plex.tv";

function accountToken() {
  const token = AuthStorage.getProfileAccountToken();
  if (!token)
    throw new Error("A Plex account token is required for watchlist access");
  return token;
}

function discoverId(guid: string) {
  const id = getPlexTitleIdentity(guid)?.id;
  if (!id)
    throw new Error("This title does not have a Plex Watchlist identifier.");
  return id;
}

export async function addToWatchlist(guid: string): Promise<void> {
  await axios.put(
    `${DISCOVER_URL}/actions/addToWatchlist`,
    {},
    {
      headers: { "X-Plex-Token": accountToken() },
      params: { ratingKey: discoverId(guid) },
    },
  );
}

export async function removeFromWatchlist(guid: string): Promise<void> {
  await axios.put(
    `${DISCOVER_URL}/actions/removeFromWatchlist`,
    {},
    {
      headers: { "X-Plex-Token": accountToken() },
      params: { ratingKey: discoverId(guid) },
    },
  );
}

export async function getWatchlist(
  signal?: AbortSignal,
): Promise<DiscoverTitle[]> {
  signal?.throwIfAborted();
  const token = accountToken();
  const pageSize = 100;
  return readPlexMetadataPages({
    resource: "watchlist data",
    pageSize,
    signal,
    identity: (item) => item.guid,
    readItem: readDiscoverTitle,
    fetchPage: async (offset) => {
      const response = await axios.get<unknown>(
        `${DISCOVER_URL}/library/sections/watchlist/all`,
        {
          headers: { "X-Plex-Token": token },
          signal,
          params: {
            includeAdvanced: 1,
            includeMeta: 1,
            "X-Plex-Container-Start": offset,
            "X-Plex-Container-Size": pageSize,
          },
        },
      );
      return response.data;
    },
  });
}
