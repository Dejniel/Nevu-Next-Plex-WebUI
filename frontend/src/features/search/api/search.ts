import { plexClient } from "plex/QuickFunctions";

export async function searchPlex(query: string): Promise<Plex.SearchResult[]> {
  const params = new URLSearchParams({
    query,
    includeCollections: "1",
    includeExtras: "1",
    searchTypes: "movies,otherVideos,tv",
    limit: "100",
  });
  const response = await plexClient.get<{
    MediaContainer: { SearchResult?: Plex.SearchResult[] };
  }>(`/library/search?${params.toString()}`);
  return response.MediaContainer.SearchResult ?? [];
}
