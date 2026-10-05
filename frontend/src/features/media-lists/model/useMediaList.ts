import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useUserSettings } from "features/settings/model";
import { loadPageWindow } from "shared/lib/loadPageWindow";
import { useAutoRefresh } from "shared/lib/useAutoRefresh";
import { createMediaListSource } from "../api/mediaLists";
import { subscribeToMediaListChanges } from "./listChanges";
import type {
  MediaListQuery,
  MediaListRecord,
  MediaListSummary,
} from "./mediaLists";

const PAGE_SIZE = 100;
interface Snapshot {
  key: string;
  items: Map<number, MediaListRecord>;
  summary: MediaListSummary | null;
  total: number | null;
  error: string | null;
  loading: boolean;
}
const empty = (key: string): Snapshot => ({
  key,
  items: new Map(),
  summary: null,
  total: null,
  error: null,
  loading: true,
});

/** Pages retain Plex positions, including repeated titles in a playlist. */
export function useMediaList(query: MediaListQuery) {
  const profileKey = useUserSettings((state) => state.profileKey);
  const { kind, libraryID, id, search, sort } = query;
  const stableQuery = useMemo<MediaListQuery>(
    () => ({ kind, libraryID, id, search, sort }),
    [kind, libraryID, id, search, sort],
  );
  const key = JSON.stringify([profileKey, stableQuery]);
  const [snapshot, setSnapshot] = useState(() => empty(key));
  const demand = useRef<(start: number, end: number) => void>(() => undefined);
  const retryRequest = useRef<() => void>(() => undefined);
  const refreshRequest = useRef<() => Promise<void>>(async () => undefined);

  useEffect(() => {
    let alive = true;
    let generation = 0;
    const state = empty(key);
    let controller = new AbortController();
    let source: ReturnType<typeof createMediaListSource> | null = null;
    const pages = new Set<number>();
    const pending = new Set<number>();
    const failed = new Set<number>();
    const queued = new Set<number>();
    let visible = [0];
    let summaryFailed = false;
    let refreshFailed = false;
    let replacement: Promise<void> | null = null;
    const publish = () => {
      if (alive) setSnapshot({ ...state, items: new Map(state.items) });
    };
    const fail = (error: unknown) => {
      state.error =
        error instanceof Error
          ? error.message
          : "Plex could not load this list.";
    };
    const startPage = (offset: number) => {
      if (!source) return;
      const requestGeneration = generation;
      pending.add(offset);
      void source
        .page(offset, PAGE_SIZE)
        .then((page) => {
          if (!alive || requestGeneration !== generation) return;
          pages.add(offset);
          if (page.total !== null) state.total = page.total;
          page.items.forEach((item, index) =>
            state.items.set(offset + index, item),
          );
        })
        .catch((error) => {
          if (!alive || requestGeneration !== generation) return;
          failed.add(offset);
          fail(error);
        })
        .finally(() => {
          if (!alive || requestGeneration !== generation) return;
          pending.delete(offset);
          state.loading = !pages.has(0) && !failed.has(0);
          publish();
          pump();
        });
    };
    const pump = () => {
      if (!alive || replacement || refreshFailed) return;
      for (const offset of queued) {
        if (pending.size >= 2) break;
        queued.delete(offset);
        if (state.total !== null && offset >= state.total) continue;
        startPage(offset);
      }
    };
    const loadSummary = () => {
      const requestGeneration = generation;
      void source
        ?.summary()
        .then((summary) => {
          if (!alive || requestGeneration !== generation) return;
          state.summary = summary;
          summaryFailed = false;
          publish();
        })
        .catch((error) => {
          if (!alive || requestGeneration !== generation) return;
          summaryFailed = true;
          fail(error);
          publish();
        });
    };
    const revalidate = (): Promise<void> => {
      if (!alive || !profileKey) return Promise.resolve();
      if (replacement) return replacement;
      generation += 1;
      const requestGeneration = generation;
      controller.abort();
      controller = new AbortController();
      pending.clear();
      queued.clear();
      state.error = null;
      publish();
      replacement = Promise.resolve()
        .then(async () => {
          source = createMediaListSource(stableQuery, controller.signal);
          const currentSource = source;
          const [window, summary] = await Promise.all([
            loadPageWindow(
              (offset) => currentSource.page(offset, PAGE_SIZE),
              visible,
            ),
            currentSource.summary(),
          ]);
          if (!alive || requestGeneration !== generation) return;
          state.items = window.items;
          state.total = window.total;
          state.summary = summary;
          state.loading = false;
          refreshFailed = false;
          summaryFailed = false;
          pages.clear();
          window.offsets.forEach((offset) => pages.add(offset));
          failed.clear();
        })
        .catch((error) => {
          if (!alive || requestGeneration !== generation) return;
          controller.abort();
          refreshFailed = true;
          state.loading = false;
          fail(error);
        })
        .finally(() => {
          if (!alive || requestGeneration !== generation) return;
          replacement = null;
          publish();
          if (!refreshFailed)
            demand.current(visible[0], visible[visible.length - 1]);
        });
      return replacement;
    };
    refreshRequest.current = revalidate;
    demand.current = (start, end) => {
      visible = [];
      for (
        let offset = Math.floor(start / PAGE_SIZE) * PAGE_SIZE;
        offset <= end;
        offset += PAGE_SIZE
      ) {
        visible.push(offset);
        if (!pages.has(offset) && !pending.has(offset) && !failed.has(offset))
          queued.add(offset);
      }
      pump();
    };
    retryRequest.current = () => {
      if (refreshFailed || !source) {
        void revalidate();
        return;
      }
      state.error = null;
      failed.forEach((offset) => queued.add(offset));
      failed.clear();
      if (summaryFailed) loadSummary();
      state.loading = !pages.has(0);
      publish();
      pump();
    };
    if (!profileKey) {
      state.loading = false;
      publish();
    } else {
      try {
        source = createMediaListSource(stableQuery, controller.signal);
        publish();
        loadSummary();
        demand.current(0, 0);
      } catch (error) {
        fail(error);
        state.loading = false;
        publish();
      }
    }
    return () => {
      alive = false;
      controller.abort();
    };
  }, [key, profileKey, stableQuery]);

  const automatic = useAutoRefresh(profileKey ? key : null, () =>
    refreshRequest.current(),
  );
  useEffect(
    () =>
      subscribeToMediaListChanges((change) => {
        if (
          change.profileKey !== profileKey ||
          (change.kind && change.kind !== kind)
        )
          return;
        if (id && change.id && change.id !== id) return;
        if (
          kind === "collection" &&
          change.libraryID &&
          change.libraryID !== libraryID
        )
          return;
        automatic.current?.invalidate();
      }),
    [profileKey, kind, id, libraryID, automatic],
  );
  const requestRange = useCallback(
    ({ start, end }: { start: number; end: number }) =>
      demand.current(start, end),
    [],
  );
  const retry = useCallback(() => retryRequest.current(), []);
  const refresh = useCallback(() => {
    void automatic.current?.refresh();
  }, [automatic]);
  return {
    ...(snapshot.key === key ? snapshot : empty(key)),
    requestRange,
    retry,
    refresh,
  };
}
