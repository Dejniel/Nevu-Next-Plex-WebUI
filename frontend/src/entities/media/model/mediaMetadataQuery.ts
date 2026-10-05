import { queryOptions } from "@tanstack/react-query";
import { getMediaMetadata } from "../api/media";
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
