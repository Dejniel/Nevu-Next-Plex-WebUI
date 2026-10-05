import { queryOptions, useQuery } from "@tanstack/react-query";
import { getActiveServerScope, useActiveServerScope } from "features/session/model";
import { publishMediaChange, type MediaScope } from "entities/media/model";
import { serverQueryClient } from "shared/api/queryClient";
import { getLibraries } from "../api/libraries";

export const librariesQueryOptions = (scope: MediaScope) =>
  queryOptions({
    queryKey: ["libraries", scope.serverId, scope.profileKey] as const,
    queryFn: ({ signal }) => getLibraries(signal),
    enabled: Boolean(scope.serverId && scope.profileKey),
    refetchInterval: 60_000,
  });

export function useLibraries() {
  return useQuery(librariesQueryOptions(useActiveServerScope()), serverQueryClient);
}

export function notifyLibrariesChanged() {
  const scope = getActiveServerScope();
  if (!scope) return;
  void serverQueryClient.invalidateQueries({
    queryKey: librariesQueryOptions(scope).queryKey,
  });
  publishMediaChange({ ...scope, kind: "recovery" });
}
