import {
  queryOptions,
  useIsMutating,
  useMutation,
  useQuery,
} from "@tanstack/react-query";
import {
  readDiscoverTitle,
  type DiscoverTitle,
  type MediaItemData,
} from "entities/media/model";
import { useAuthSession } from "features/session/model";
import { useUserSettings } from "features/settings/model";
import { serverQueryClient } from "shared/api/queryClient";
import {
  addToWatchlist,
  getWatchlist,
  removeFromWatchlist,
} from "../api/watchlist";
import { canWatchlist } from "./watchlistItem";

export const watchlistQueryKey = (profileKey: string | null) =>
  ["watchlist", profileKey] as const;
const watchlistQueryOptions = (profileKey: string | null) =>
  queryOptions({
    queryKey: watchlistQueryKey(profileKey),
    queryFn: ({ signal }) => getWatchlist(signal),
    enabled: Boolean(profileKey),
    refetchInterval: 60_000,
  });
export function useWatchlist() {
  const profileKey = useUserSettings((state) => state.profileKey);
  return useQuery(watchlistQueryOptions(profileKey), serverQueryClient);
}

interface MembershipEdit {
  profileKey: string;
  revision: number;
  item: MediaItemData;
  included: boolean;
}
function isCurrent(edit: MembershipEdit) {
  const auth = useAuthSession.getState();
  return (
    auth.status === "ready" &&
    auth.revision === edit.revision &&
    useUserSettings.getState().profileKey === edit.profileKey
  );
}
export function useWatchlistAction(item: MediaItemData) {
  const profileKey = useUserSettings((state) => state.profileKey);
  const result = useWatchlist();
  const mutationKey = [
    ...watchlistQueryKey(profileKey),
    "membership",
    item.guid,
  ] as const;
  const pending =
    useIsMutating({ mutationKey, exact: true }, serverQueryClient) > 0;
  const mutation = useMutation(
    {
      mutationKey,
      onMutate: (edit: MembershipEdit) =>
        serverQueryClient.cancelQueries({
          queryKey: watchlistQueryKey(edit.profileKey),
          exact: true,
        }),
      mutationFn: async (edit: MembershipEdit) => {
        if (!isCurrent(edit))
          throw new Error("The active Plex profile changed.");
        if (!canWatchlist(edit.item))
          throw new Error("This item cannot be added to Watchlist.");
        const added = edit.included ? readDiscoverTitle(edit.item) : null;
        if (edit.included) await addToWatchlist(edit.item.guid);
        else await removeFromWatchlist(edit.item.guid);
        return added;
      },
      onSuccess: async (added, edit) => {
        if (!isCurrent(edit)) return;
        const key = watchlistQueryKey(edit.profileKey);
        // A read started while the write was pending must not restore old membership.
        await serverQueryClient.cancelQueries({ queryKey: key, exact: true });
        if (!isCurrent(edit)) return;
        serverQueryClient.setQueryData<DiscoverTitle[]>(key, (previous) => {
          if (!previous) return previous;
          const items = previous.filter(
            (entry) => entry.guid !== edit.item.guid,
          );
          return added ? [added, ...items] : items;
        });
      },
    },
    serverQueryClient,
  );
  return {
    selected: result.data?.some((entry) => entry.guid === item.guid) ?? false,
    loading: pending || (result.isPending && result.isFetching),
    available: Boolean(profileKey) && canWatchlist(item),
    toggle: async () => {
      if (!profileKey || !canWatchlist(item)) return;
      const edit = {
        profileKey,
        revision: useAuthSession.getState().revision,
        item,
        included: false,
      };
      const key = watchlistQueryKey(profileKey);
      let data = serverQueryClient.getQueryData<DiscoverTitle[]>(key);
      if (!data) {
        const loaded = await result.refetch();
        if (!loaded.data)
          throw loaded.error ?? new Error("Could not read your Watchlist.");
        data = loaded.data;
      }
      if (
        !isCurrent(edit) ||
        serverQueryClient.isMutating({ mutationKey, exact: true })
      )
        return;
      edit.included = !data.some((entry) => entry.guid === item.guid);
      await mutation.mutateAsync(edit);
    },
  };
}
