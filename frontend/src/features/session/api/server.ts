import { ProxiedRequest } from "shared/api/backend";

async function getServerResource(path: string, token: string) {
  const response = await ProxiedRequest(path, "GET", {
    Accept: "application/json",
    "X-Plex-Token": token,
  });
  if (response.status !== 200)
    throw new Error(`Plex server request failed with status ${response.status}`);
  return response.data;
}

export async function getServerSessionContext(token: string) {
  const [root, providers] = await Promise.all([
    getServerResource("/", token),
    getServerResource("/media/providers", token).catch(() => null),
  ]);
  return {
    server: (root?.MediaContainer ?? null) as Plex.ServerPreferences | null,
    providers,
  };
}
