import axios from "axios";
import { AuthStorage } from "features/session/model";

const DISCOVER_URL = "https://discover.provider.plex.tv";

function accountToken() {
  const token = AuthStorage.getProfileAccountToken();
  if (!token) throw new Error("A Plex account token is required for watchlist access");
  return token;
}

function discoverId(guid: string) {
  const id = guid.split("/").filter(Boolean).at(-1);
  if (!id) throw new Error(`Invalid Plex GUID: ${guid}`);
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

export async function getWatchlist(): Promise<Plex.Metadata[]> {
  const response = await axios.get(
    `${DISCOVER_URL}/library/sections/watchlist/all`,
    {
      headers: { "X-Plex-Token": accountToken() },
      params: {
        includeAdvanced: 1,
        includeMeta: 1,
        "X-Plex-Container-Start": 0,
        "X-Plex-Container-Size": 300,
      },
    },
  );
  return response.data.MediaContainer.Metadata ?? [];
}
