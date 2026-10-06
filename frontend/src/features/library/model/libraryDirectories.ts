import { queryOptions, type QueryClient } from "@tanstack/react-query";
import type { MediaScope, ReconciledMediaChange } from "entities/media/model";
import { getLibraryDirectory } from "../api/libraryDirectories";
import { decideLibraryDirectorySynchronization } from "./libraryDirectorySynchronization";

export const libraryDirectoryQueryOptions = (
  scope: MediaScope,
  dir: string,
  props?: Record<string, unknown>,
) =>
  queryOptions({
    queryKey: ["library-directory", scope.serverId, scope.profileKey, dir, props ?? null] as const,
    queryFn: ({ signal }) => getLibraryDirectory(dir, props, signal),
    refetchInterval: 60_000,
    enabled: Boolean(scope.serverId && scope.profileKey && dir),
  });

export async function applyLibraryDirectoryChanges(
  client: QueryClient,
  changes: readonly ReconciledMediaChange[],
) {
  if (!changes.length) return;
  const scope = changes[0].change;
  const queries = client.getQueryCache().findAll({
    queryKey: ["library-directory", scope.serverId, scope.profileKey],
  });
  await Promise.all(queries.map(async (query) => {
    const [, , , dir, props] = query.queryKey as ReturnType<typeof libraryDirectoryQueryOptions>["queryKey"];
    const data = query.state.data as Plex.MediaContainer | undefined;
    const patches = new Map<string, Plex.Metadata>();
    let refresh = false;
    for (const entry of changes) {
      const decision = decideLibraryDirectorySynchronization(dir, props, data, entry);
      refresh ||= decision === "refresh";
      if (decision === "patch") {
        const metadata = entry.update!.metadata as Plex.Metadata;
        patches.set(metadata.ratingKey, metadata);
      }
    }
    if (!refresh && !patches.size) return;
    refresh ||= query.state.fetchStatus === "fetching";
    const filter = { queryKey: query.queryKey, exact: true };
    await client.cancelQueries(filter);
    if (refresh) await client.invalidateQueries(filter, { throwOnError: true });
    else client.setQueryData(query.queryKey, {
      ...data,
      Metadata: data!.Metadata?.map((item) => patches.get(item.ratingKey) ?? item),
    });
  }));
}

export const librarySectionQueryOptions = (scope: MediaScope, section: string) =>
  libraryDirectoryQueryOptions(scope, `/library/sections/${encodeURIComponent(section)}`, {
    includeDetails: 1,
  });
