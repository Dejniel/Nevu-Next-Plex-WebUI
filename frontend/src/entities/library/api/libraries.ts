import { plexClient } from "features/session/model";

export async function getLibraries(): Promise<Plex.LibarySection[]> {
  const response = await plexClient.get<{ MediaContainer: Plex.MediaContainer }>(
    "/library/sections",
  );
  return response.MediaContainer.Directory ?? [];
}
