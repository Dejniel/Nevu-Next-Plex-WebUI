import axios from "axios";
import { AuthStorage } from "features/session/model";

const DISCOVER_URL = "https://discover.provider.plex.tv";

function accountToken() {
  const token = AuthStorage.getProfileAccountToken();
  if (!token)
    throw new Error("A Plex account token is required for watchlist access");
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

export async function getWatchlist(
  signal?: AbortSignal,
): Promise<Plex.Metadata[]> {
  const token = accountToken();
  const pageSize = 100;
  const items = new Map<string, Plex.Metadata>();
  let offset = 0;

  while (true) {
    const response = await axios.get(
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
    const container = response.data?.MediaContainer;
    if (!container) throw new Error("Plex returned an invalid watchlist.");
    const page: Plex.Metadata[] = container.Metadata ?? [];
    const previousSize = items.size;
    for (const item of page) {
      if (!item.guid)
        throw new Error(
          "Plex returned a watchlist item without an identifier.",
        );
      items.set(item.guid, item);
    }
    offset += page.length;
    if (page.length && items.size === previousSize)
      throw new Error("Plex could not return the remaining watchlist items.");
    const total = container.totalSize as number | undefined;
    if (total !== undefined ? offset >= total : page.length < pageSize)
      return [...items.values()];
    if (!page.length)
      throw new Error("Plex could not return the remaining watchlist items.");
  }
}
