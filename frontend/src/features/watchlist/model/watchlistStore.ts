import { create } from "zustand";
import { QueryObserver, type Query } from "@tanstack/react-query";
import { serverQueryClient } from "shared/api/queryClient";
import { useUserSettings } from "features/settings/model";
import {
  addToWatchlist,
  getWatchlist,
  removeFromWatchlist,
} from "../api/watchlist";

interface WatchlistData {
  items: Plex.Metadata[];
  loaded: boolean;
}
interface WatchlistState {
  items: Plex.Metadata[];
  status: "idle" | "loading" | "ready" | "error";
  hasLoaded: boolean;
  error: string | null;
  add: (item: Plex.Metadata) => Promise<void>;
  remove: (guid: string) => Promise<void>;
  load: (maxAge?: number) => Promise<void>;
  has: (guid: string) => boolean;
  reset: () => void;
}

export const watchlistQueryKey = () =>
  ["watchlist", useUserSettings.getState().profileKey] as const;
const changes = new WeakMap<object, Map<string, Plex.Metadata | null>>();
const mutations = new WeakMap<object, Set<string>>();
const empty = { items: [] as Plex.Metadata[], loaded: false };
const options = () => ({
  queryKey: watchlistQueryKey(),
  enabled: false,
  queryFn: async ({
    signal,
  }: {
    signal: AbortSignal;
  }): Promise<WatchlistData> => {
    const query = observer.getCurrentQuery();
    const edits = new Map<string, Plex.Metadata | null>();
    changes.set(query, edits);
    try {
      const items = await getWatchlist(signal);
      const merged = new Map(items.map((item) => [item.guid, item]));
      const added: Plex.Metadata[] = [];
      edits.forEach((item, guid) => {
        merged.delete(guid);
        if (item) added.unshift(item);
      });
      return { items: [...added, ...merged.values()], loaded: true };
    } finally {
      changes.delete(query);
    }
  },
});
const observer = new QueryObserver<WatchlistData>(serverQueryClient, options());
const prepare = () => observer.setOptions(options());
const data = () =>
  serverQueryClient.getQueryData<WatchlistData>(watchlistQueryKey()) ?? empty;
const current = (query: Query<WatchlistData>) =>
  query === observer.getCurrentQuery() &&
  serverQueryClient
    .getQueryCache()
    .find({ queryKey: query.queryKey, exact: true }) === query &&
  query.queryKey[1] === watchlistQueryKey()[1];

async function mutate(guid: string, item: Plex.Metadata | null) {
  prepare();
  const query = observer.getCurrentQuery();
  const pending = mutations.get(query) ?? new Set<string>();
  if (
    pending.has(guid) ||
    Boolean(item) === data().items.some((entry) => entry.guid === guid)
  )
    return;
  pending.add(guid);
  mutations.set(query, pending);
  try {
    if (item) await addToWatchlist(guid);
    else await removeFromWatchlist(guid);
    if (!current(query)) return;
    changes.get(query)?.set(guid, item);
    const previous = data();
    serverQueryClient.setQueryData(query.queryKey, {
      ...previous,
      items: item
        ? [item, ...previous.items.filter((entry) => entry.guid !== guid)]
        : previous.items.filter((entry) => entry.guid !== guid),
    });
  } finally {
    pending.delete(guid);
  }
}

// Zustand exposes the existing UI actions and a projection; Query owns server data.
export const useWatchlist = create<WatchlistState>((_set, get) => ({
  items: [],
  status: "idle",
  hasLoaded: false,
  error: null,
  add: (item) => mutate(item.guid, item),
  remove: (guid) => mutate(guid, null),
  has: (guid) => get().items.some((item) => item.guid === guid),
  load: (maxAge = 0) => {
    prepare();
    return serverQueryClient
      .fetchQuery({ ...options(), staleTime: data().loaded ? maxAge : 0 })
      .then(
        () => undefined,
        () => undefined,
      );
  },
  reset: () => {
    serverQueryClient.removeQueries({ queryKey: ["watchlist"] });
    prepare();
  },
}));
observer.subscribe((result) =>
  useWatchlist.setState({
    items: result.data?.items ?? [],
    status: result.isFetching
      ? "loading"
      : result.isError
        ? "error"
        : result.data?.loaded
          ? "ready"
          : "idle",
    hasLoaded: result.data?.loaded ?? false,
    error: result.isError
      ? "Could not refresh your Plex Watchlist. Please try again."
      : null,
  }),
);
