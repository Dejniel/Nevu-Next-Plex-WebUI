import type { MediaMetadata } from "plex/media";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerSession } from "features/session/model";
import { serverQueryClient } from "shared/api/queryClient";
import { availabilityQueryOptions } from "./availabilityQuery";
import { indexMediaAvailability } from "./mediaAvailability";

const empty: MediaMetadata[] = [];
export function useMediaAvailability(guids: readonly string[], profileKey: string | null) {
  const serverId = useServerSession((state) => state.server?.machineIdentifier) ?? "";
  const enabled = Boolean(serverId && profileKey && guids.length);
  const result = useQuery(
    { ...availabilityQueryOptions({ serverId, profileKey: profileKey ?? "" }, guids), enabled },
    serverQueryClient,
  );
  const data = enabled ? (result.data ?? empty) : empty;
  const items = useMemo(() => indexMediaAvailability(data), [data]);
  return {
    items,
    loading: enabled && result.isPending,
    error:
      enabled && result.isError
        ? "Could not check which titles are available on this server."
        : null,
    retry: () => {
      void result.refetch();
    },
  };
}
