import { queryOptions } from "@tanstack/react-query";
import { getLocalMediaMatches } from "../api/mediaAvailability";
import type { MediaScope } from "./mediaChanges";

export function availabilityQueryOptions(scope: MediaScope, guids: readonly string[]) {
  const requested = [...new Set(guids.filter(Boolean))].sort();
  return queryOptions({
    queryKey: ["availability", scope.serverId, scope.profileKey, requested] as const,
    queryFn: ({ signal }) => getLocalMediaMatches(requested, signal),
    refetchInterval: 60_000,
  });
}
