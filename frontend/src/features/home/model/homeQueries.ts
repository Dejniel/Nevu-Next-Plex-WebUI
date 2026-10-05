import { queryOptions, type QueryClient, type Query } from "@tanstack/react-query";
import {
  mediaMetadataQueryOptions,
  type MediaScope,
  type ReconciledMediaChange,
} from "entities/media/model";
import { libraryDirectoryQueryOptions } from "features/library/model";
import { hasHeroArtwork, heroCandidates, randomLibraryWindow, shuffled } from "./homeDiscovery";

export const homeWindowOptions = (scope: MediaScope, section: string, start = 0, size = 1) =>
  libraryDirectoryQueryOptions(scope, `/library/sections/${encodeURIComponent(section)}/all`, {
    sort: "titleSort:asc",
    "X-Plex-Container-Start": start,
    "X-Plex-Container-Size": size,
  });

export const homeHeroOptions = (client: QueryClient, scope: MediaScope, sections: string[]) =>
  queryOptions({
    queryKey: ["home", scope.serverId, scope.profileKey, "hero", sections] as const,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: async ({ signal }) => {
      for (const section of shuffled(sections)) {
        try {
          signal.throwIfAborted();
          const summary = await client.fetchQuery(homeWindowOptions(scope, section));
          const window = randomLibraryWindow(summary.totalSize ?? summary.size, 8);
          if (!window) continue;
          const first = await client.fetchQuery(
            homeWindowOptions(scope, section, window.start, window.size),
          );
          const wrapped = window.wrapSize
            ? await client.fetchQuery(homeWindowOptions(scope, section, 0, window.wrapSize))
            : null;
          for (const item of heroCandidates([
            ...(first.Metadata ?? []),
            ...(wrapped?.Metadata ?? []),
          ])) {
            signal.throwIfAborted();
            const metadata = await client.fetchQuery(
              mediaMetadataQueryOptions(scope, item.ratingKey),
            );
            signal.throwIfAborted();
            if (hasHeroArtwork(metadata)) return item.ratingKey;
          }
        } catch (error) {
          signal.throwIfAborted();
          console.warn(`Unable to select a home hero from library ${section}`, error);
        }
      }
      return null;
    },
  });

export async function applyHomeChanges(
  client: QueryClient,
  changes: readonly ReconciledMediaChange[],
) {
  if (!changes.length) return;
  const scope = changes[0].change;
  const filters = {
    queryKey: ["home", scope.serverId, scope.profileKey],
    predicate: (query: Query) => {
      const [, , , , sections] = query.queryKey as ReturnType<typeof homeHeroOptions>["queryKey"];
      return changes.some(({ change, update }) => {
        if (change.kind === "list") return false;
        // Keep a usable hero stable during ordinary item processing and playback changes.
        if (query.state.data && change.kind === "item" && update?.item)
          return query.state.data === update.item.ratingKey && !hasHeroArtwork(update.item);
        if (change.kind === "item" && change.effect === "metadata") return false;
        return !change.sectionId || sections.includes(change.sectionId);
      });
    },
  };
  await client.cancelQueries(filters);
  await client.invalidateQueries(filters, { throwOnError: true });
}
