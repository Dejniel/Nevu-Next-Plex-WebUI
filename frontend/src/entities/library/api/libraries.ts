import { plexClient } from "features/session/model";

export async function getLibraries(signal?: AbortSignal): Promise<Plex.LibarySection[]> {
  const response = await plexClient.get<{
    MediaContainer: { Directory?: Plex.LibarySection[] };
  }>("/library/sections", signal);
  return response.MediaContainer.Directory ?? [];
}
