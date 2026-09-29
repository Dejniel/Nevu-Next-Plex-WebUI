import { create } from "zustand";
import {
  addToWatchlist,
  getWatchlist,
  removeFromWatchlist,
} from "../api/watchlist";

interface WatchlistState {
  items: Plex.Metadata[];
  add: (item: Plex.Metadata) => Promise<void>;
  remove: (guid: string) => Promise<void>;
  load: () => Promise<void>;
  has: (guid: string) => boolean;
  reset: () => void;
}

let profileGeneration = 0;
let loadGeneration = 0;
let mutationRevision = 0;
const pendingGuids = new Map<string, symbol>();

export const useWatchlist = create<WatchlistState>((set, get) => ({
  items: [],

  add: async (item) => {
    if (get().has(item.guid) || pendingGuids.has(item.guid)) return;
    const requestProfile = profileGeneration;
    const request = Symbol(item.guid);
    pendingGuids.set(item.guid, request);
    mutationRevision += 1;
    try {
      await addToWatchlist(item.guid);
      if (requestProfile !== profileGeneration) return;
      set((state) =>
        state.items.some((candidate) => candidate.guid === item.guid)
          ? state
          : { items: [item, ...state.items] },
      );
    } finally {
      if (pendingGuids.get(item.guid) === request) pendingGuids.delete(item.guid);
      mutationRevision += 1;
    }
  },

  remove: async (guid) => {
    if (!get().has(guid) || pendingGuids.has(guid)) return;
    const requestProfile = profileGeneration;
    const request = Symbol(guid);
    pendingGuids.set(guid, request);
    mutationRevision += 1;
    try {
      await removeFromWatchlist(guid);
      if (requestProfile !== profileGeneration) return;
      set((state) => ({
        items: state.items.filter((item) => item.guid !== guid),
      }));
    } finally {
      if (pendingGuids.get(guid) === request) pendingGuids.delete(guid);
      mutationRevision += 1;
    }
  },

  load: async () => {
    const requestProfile = profileGeneration;
    const requestLoad = ++loadGeneration;
    const requestMutation = mutationRevision;
    const items = await getWatchlist();
    if (
      requestProfile === profileGeneration &&
      requestLoad === loadGeneration &&
      requestMutation === mutationRevision
    )
      set({ items });
  },

  has: (guid) => get().items.some((item) => item.guid === guid),

  reset: () => {
    profileGeneration += 1;
    loadGeneration += 1;
    mutationRevision += 1;
    pendingGuids.clear();
    set({ items: [] });
  },
}));
