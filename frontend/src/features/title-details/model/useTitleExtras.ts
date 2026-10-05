import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useActiveServerScope } from "features/session/model";
import { serverQueryClient } from "shared/api/queryClient";
import {
  mediaExtrasQueryOptions,
  mergeTitleExtras,
  selectPrimaryTrailer,
} from "entities/media/model";

export function useTitleExtras(item?: Plex.Metadata | null) {
  const { profileKey } = useActiveServerScope();
  const options = mediaExtrasQueryOptions(profileKey, item ?? {});
  const discover = useQuery(options, serverQueryClient);
  const extras = useMemo(
    () => (item ? mergeTitleExtras(item.Extras?.Metadata, discover.data) : []),
    [item, discover.data],
  );
  return {
    extras,
    loading: Boolean(options.enabled) && discover.isPending,
    primaryTrailer: selectPrimaryTrailer(extras, item?.primaryExtraKey),
  };
}
