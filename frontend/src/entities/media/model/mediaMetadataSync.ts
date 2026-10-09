import type { MediaMetadata } from "plex/media";
import type { QueryClient } from "@tanstack/react-query";
import { isLibraryContainerType } from "@nevu/contracts";
import {
  affectedMediaParents,
  type ReconciledMediaChange,
} from "./mediaChanges";
import { readMediaQueryKey } from "./mediaMetadataQuery";

export async function applyMediaMetadataChanges(
  client: QueryClient,
  changes: readonly ReconciledMediaChange[],
) {
  if (!changes.length) return;
  const scope = changes[0].change;
  const parents = new Set(changes.flatMap(affectedMediaParents));
  await Promise.all(client.getQueryCache().findAll({
    queryKey: ["media", scope.serverId, scope.profileKey],
  }).map(async (query) => {
    const key = readMediaQueryKey(query.queryKey);
    if (!key) return;
    const metadata = query.state.data as MediaMetadata | undefined;
    const replacement = changes.find(({ change, update }) =>
      change.kind === "item" && change.id === key.id && update?.metadata,
    )?.update?.metadata;
    const refresh = parents.has(key.id) || changes.some(({ change, update, parentScopeUnknown }) => {
      if (change.kind === "list") return false;
      if (change.kind === "item" && change.id) {
        if (key.id === change.id) return !update?.metadata;
        if (!parentScopeUnknown || (metadata && !isLibraryContainerType(metadata.type)))
          return false;
      }
      return !change.sectionId || !metadata || String(metadata.librarySectionID) === change.sectionId;
    });
    if (!replacement && !refresh) return;
    const filter = { queryKey: query.queryKey, exact: true };
    await client.cancelQueries(filter);
    if (replacement) client.setQueryData(query.queryKey, replacement);
    // A deleted item's details may return 404; Query exposes it without blocking other resources.
    if (refresh) await client.invalidateQueries(filter);
  }));
}
