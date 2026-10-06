import type { QueryClient } from "@tanstack/react-query";
import { affectedMediaParents, type ReconciledMediaChange } from "./mediaChanges";
import { readMediaQueryKey } from "./mediaMetadataQuery";

export async function applyMediaDetailsChanges(
  client: QueryClient,
  changes: readonly ReconciledMediaChange[],
) {
  if (!changes.length) return;
  const scope = changes[0].change;
  const queries = client
    .getQueryCache()
    .findAll()
    .filter((query) => {
      const key = readMediaQueryKey(query.queryKey);
      return (
        key &&
        key.kind !== "media" &&
        key.scope.serverId === scope.serverId &&
        key.scope.profileKey === scope.profileKey
      );
    });
  await Promise.all(
    queries.map(async (query) => {
      const key = readMediaQueryKey(query.queryKey)!;
      const items =
        key.kind === "media-children"
          ? (query.state.data as Plex.Metadata[] | undefined)
          : undefined;
      const affected = changes.filter((entry) => {
        const { change, update, parentScopeUnknown } = entry;
        if (change.kind === "list") return false;
        if (key.kind === "media-guid")
          return (
            change.kind !== "item" ||
            change.effect !== "metadata" ||
            change.fields.includes("guid") ||
            change.fields.includes("unknown")
          );
        if (change.kind !== "item" || !change.id)
          return (
            !change.sectionId ||
            !items ||
            items.some((item) => String(item.librarySectionID) === change.sectionId)
          );
        const parents = affectedMediaParents(entry);
        return (
          key.id === change.id ||
          parents.includes(key.id) ||
          items?.some(
            (item) =>
              item.ratingKey === change.id ||
              item.parentRatingKey === change.id ||
              item.grandparentRatingKey === change.id,
          ) ||
          ((parentScopeUnknown || (!update && !parents.length && change.effect !== "metadata")) &&
            (!change.sectionId || !items ||
              items.some((item) => String(item.librarySectionID) === change.sectionId)))
        );
      });
      if (!affected.length) return;
      const replacements = affected.map(({ change, update }) => {
        const metadata = update?.metadata as Plex.Metadata | undefined;
        const before = items?.find((item) => item.ratingKey === metadata?.ratingKey);
        return change.kind === "item" &&
          change.effect !== "membership" &&
          metadata?.type === "episode" &&
          before &&
          before.index === metadata.index &&
          before.parentRatingKey === metadata.parentRatingKey
          ? metadata
          : null;
      });
      const patch = items && query.state.fetchStatus !== "fetching" && replacements.every(Boolean);
      await client.cancelQueries({ queryKey: query.queryKey, exact: true });
      if (patch) {
        client.setQueryData<Plex.Metadata[]>(
          query.queryKey,
          items.map(
            (item) =>
              replacements.find((replacement) => replacement?.ratingKey === item.ratingKey) ?? item,
          ),
        );
        return;
      }
      await client.invalidateQueries(
        { queryKey: query.queryKey, exact: true },
        { throwOnError: true },
      );
    }),
  );
}
