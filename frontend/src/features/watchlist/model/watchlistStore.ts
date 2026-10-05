import { create } from "zustand";
import {
  addToWatchlist,
  getWatchlist,
  removeFromWatchlist,
} from "../api/watchlist";

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

let profileGeneration = 0;
let loadGeneration = 0;
let pendingLoad: Promise<void> | null = null;
let loadController: AbortController | null = null;
let loadChanges: Map<string, Plex.Metadata | null> | null = null;
let lastLoadedAt: number | null = null;
const pendingGuids = new Map<string, symbol>();

export const useWatchlist = create<WatchlistState>((set, get) => ({
  items: [],
  status: "idle",
  hasLoaded: false,
  error: null,

  add: async (item) => {
    if (get().has(item.guid) || pendingGuids.has(item.guid)) return;
    const requestProfile = profileGeneration;
    const request = Symbol(item.guid);
    pendingGuids.set(item.guid, request);
    try {
      await addToWatchlist(item.guid);
      if (requestProfile !== profileGeneration) return;
      loadChanges?.set(item.guid, item);
      set((state) =>
        state.items.some((candidate) => candidate.guid === item.guid)
          ? state
          : { items: [item, ...state.items] },
      );
    } finally {
      if (pendingGuids.get(item.guid) === request)
        pendingGuids.delete(item.guid);
    }
  },

  remove: async (guid) => {
    if (!get().has(guid) || pendingGuids.has(guid)) return;
    const requestProfile = profileGeneration;
    const request = Symbol(guid);
    pendingGuids.set(guid, request);
    try {
      await removeFromWatchlist(guid);
      if (requestProfile !== profileGeneration) return;
      loadChanges?.set(guid, null);
      set((state) => ({
        items: state.items.filter((item) => item.guid !== guid),
      }));
    } finally {
      if (pendingGuids.get(guid) === request) pendingGuids.delete(guid);
    }
  },

  load: (maxAge = 0) => {
    if (pendingLoad) return pendingLoad;
    if (
      get().status === "ready" &&
      lastLoadedAt !== null &&
      maxAge > 0 &&
      Date.now() - lastLoadedAt < maxAge
    )
      return Promise.resolve();
    const requestProfile = profileGeneration;
    const requestLoad = ++loadGeneration;
    const changes = new Map<string, Plex.Metadata | null>();
    loadChanges = changes;
    const controller = new AbortController();
    loadController = controller;
    set({ status: "loading", error: null });
    const promise = getWatchlist(controller.signal)
      .then((items) => {
        if (
          requestProfile !== profileGeneration ||
          requestLoad !== loadGeneration
        )
          return;
        const added: Plex.Metadata[] = [];
        const merged = new Map(items.map((item) => [item.guid, item]));
        changes.forEach((item, guid) => {
          merged.delete(guid);
          if (item) added.unshift(item);
        });
        lastLoadedAt = Date.now();
        set({
          items: [...added, ...merged.values()],
          status: "ready",
          hasLoaded: true,
          error: null,
        });
      })
      .catch(() => {
        if (
          requestProfile === profileGeneration &&
          requestLoad === loadGeneration
        )
          set({
            status: "error",
            error: "Could not refresh your Plex Watchlist. Please try again.",
          });
      })
      .finally(() => {
        if (pendingLoad === promise) {
          pendingLoad = null;
          loadController = null;
          loadChanges = null;
        }
      });
    pendingLoad = promise;
    return promise;
  },

  has: (guid) => get().items.some((item) => item.guid === guid),

  reset: () => {
    profileGeneration += 1;
    loadGeneration += 1;
    pendingGuids.clear();
    loadController?.abort();
    loadController = null;
    pendingLoad = null;
    loadChanges = null;
    lastLoadedAt = null;
    set({ items: [], status: "idle", hasLoaded: false, error: null });
  },
}));
