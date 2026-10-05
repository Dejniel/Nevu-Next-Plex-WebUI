import { queryOptions, type QueryClient } from "@tanstack/react-query";
import type { MediaScope, ReconciledMediaChange } from "entities/media/model";
import { getLibraryDirectory } from "../api/libraryDirectories";

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
  const filters = {
    queryKey: ["library-directory", scope.serverId, scope.profileKey],
    predicate: ({ queryKey }: { queryKey: readonly unknown[] }) => {
      const [, , , dir] = queryKey as ReturnType<typeof libraryDirectoryQueryOptions>["queryKey"];
      const section = dir.match(/^\/library\/sections\/([^/]+)/)?.[1];
      return changes.some(
        ({ change }) =>
          change.kind !== "list" && (!section || !change.sectionId || change.sectionId === section),
      );
    },
  };
  await client.cancelQueries(filters);
  await client.invalidateQueries(filters, { throwOnError: true });
}

export const librarySectionQueryOptions = (scope: MediaScope, section: string) =>
  libraryDirectoryQueryOptions(scope, `/library/sections/${encodeURIComponent(section)}`, {
    includeDetails: 1,
  });
