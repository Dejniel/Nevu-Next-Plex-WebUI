import { PlexClient } from "shared/api/PlexClient";

export async function getServerSessionContext(token: string) {
  const client = new PlexClient(() => token);
  const [root, providers] = await Promise.all([
    client.get<{ MediaContainer?: Plex.ServerPreferences }>("/"),
    client.get("/media/providers").catch(() => null),
  ]);
  return {
    server: root?.MediaContainer ?? null,
    providers,
  };
}
