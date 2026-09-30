import { plexClient } from "features/session/model";

export async function getLibraries(): Promise<Plex.LibarySection[]> {
  const response = await plexClient.get<{
    MediaContainer: { Directory?: Plex.LibarySection[] };
  }>("/library/sections");
  return response.MediaContainer.Directory ?? [];
}
