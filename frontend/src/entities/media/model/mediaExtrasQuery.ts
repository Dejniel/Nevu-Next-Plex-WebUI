import { queryOptions } from "@tanstack/react-query";
import { fetchDiscoverExtras } from "../api/mediaExtras";
import { getDiscoverID } from "./mediaExtras";

export function mediaExtrasQueryOptions(
  profileKey: string,
  item: Partial<Pick<Plex.Metadata, "guid" | "Guid">>,
) {
  const id = getDiscoverID(item);
  return queryOptions({
    queryKey: ["discover-extras", profileKey, id] as const,
    queryFn: ({ signal }) => fetchDiscoverExtras(item, signal),
    enabled: Boolean(profileKey && id),
  });
}
