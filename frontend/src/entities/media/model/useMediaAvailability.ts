import { useCallback, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { serverQueryClient } from "shared/api/queryClient";
import { subscribeToLibraryCache } from "shared/lib/libraryCache";
import { useAutoRefresh } from "shared/lib/useAutoRefresh";
import { getLocalMediaMatches } from "../api/mediaAvailability";
import {
  indexMediaAvailability,
  type MediaAvailability,
} from "./mediaAvailability";

const empty = new Map<string, MediaAvailability>();

export function useMediaAvailability(
  guids: readonly string[],
  profileKey: string | null,
) {
  const key = JSON.stringify([...new Set(guids)].sort());
  const requested = useMemo<string[]>(() => JSON.parse(key), [key]);
  const enabled = Boolean(profileKey && requested.length);
  const result = useQuery(
    {
      queryKey: ["availability", profileKey, key],
      enabled,
      queryFn: async ({ signal }) =>
        indexMediaAvailability(await getLocalMediaMatches(requested, signal)),
    },
    serverQueryClient,
  );
  const refresh = useAutoRefresh(
    enabled ? `${profileKey}:${key}` : null,
    async () => {
      await result.refetch({ cancelRefetch: false });
    },
  );
  useEffect(
    () =>
      subscribeToLibraryCache((scope) => {
        if (!scope?.profileKey || scope.profileKey === profileKey)
          refresh.current?.invalidate();
      }),
    [profileKey, refresh],
  );
  const retry = useCallback(() => {
    void refresh.current?.refresh();
  }, [refresh]);
  return {
    items: enabled ? (result.data ?? empty) : empty,
    loading: enabled && result.isPending,
    error:
      enabled && result.isError
        ? "Could not check which titles are available on this server."
        : null,
    retry,
  };
}
