import { queryOptions, type QueryKey } from "@tanstack/react-query";
import { getMediaMetadata, getMediaChildren, getMediaByGuid } from "../api/media";
import type { MediaScope } from "./mediaChanges";

export const mediaMetadataQueryKey = (scope: MediaScope, id: string) =>
  ["media", scope.serverId, scope.profileKey, id] as const;

export function mediaMetadataQueryOptions(scope: MediaScope, id: string) {
  return queryOptions({
    queryKey: mediaMetadataQueryKey(scope, id),
    queryFn: ({ signal }) => getMediaMetadata(id, signal),
    structuralSharing: true,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
}

export const mediaChildrenQueryKey = (scope: MediaScope, id: string) =>
  ["media-children", scope.serverId, scope.profileKey, id] as const;
export const mediaChildrenQueryOptions = (scope: MediaScope, id: string) =>
  queryOptions({
    queryKey: mediaChildrenQueryKey(scope, id),
    queryFn: ({ signal }) => getMediaChildren(id, signal),
    refetchInterval: 60_000,
  });
export const mediaGuidQueryOptions = (scope: MediaScope, guid: string) =>
  queryOptions({
    queryKey: ["media-guid", scope.serverId, scope.profileKey, guid] as const,
    queryFn: ({ signal }) => getMediaByGuid(guid, signal),
  });

export function readMediaQueryKey(key: QueryKey) {
  const [kind, serverId, profileKey, id] = key;
  if (
    (kind !== "media" && kind !== "media-children" && kind !== "media-guid") ||
    key.length !== 4 ||
    typeof serverId !== "string" ||
    typeof profileKey !== "string" ||
    typeof id !== "string"
  )
    return null;
  return { kind, scope: { serverId, profileKey }, id };
}
