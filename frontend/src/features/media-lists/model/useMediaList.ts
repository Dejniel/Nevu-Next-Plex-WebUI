import { useCallback, useEffect, useRef, useState } from "react";
import { useUserSettings } from "features/settings/model";
import { createMediaListSource } from "../api/mediaLists";
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
  const key = JSON.stringify([profileKey, query]);
  const [revision, setRevision] = useState(0);
  const [snapshot, setSnapshot] = useState(() => empty(key));
  const demand = useRef<(start: number, end: number) => void>(() => undefined);
  const retryRequest = useRef<() => void>(() => undefined);

  useEffect(() => {
    let alive = true;
    let state = empty(key);
    const pages = new Set<number>();
    const pending = new Set<number>();
    const failed = new Set<number>();
    const queued = new Set<number>();
    let summaryFailed = false;
    let source: ReturnType<typeof createMediaListSource>;
    const publish = () => {
      if (alive) setSnapshot({ ...state, items: new Map(state.items) });
    };
    try {
      source = createMediaListSource(JSON.parse(key)[1]);
    } catch (error) {
      setSnapshot({
        ...state,
        loading: false,
        error:
          error instanceof Error ? error.message : "Could not open this list.",
      });
      retryRequest.current = () => setRevision((value) => value + 1);
      demand.current = () => undefined;
      return;
    }
    const fail = (error: unknown) => {
      state.error =
        error instanceof Error
          ? error.message
          : "Plex could not load this list.";
    };
    const startPage = (offset: number) => {
      pending.add(offset);
      void source
        .page(offset, PAGE_SIZE)
        .then((page) => {
          if (!alive) return;
          pages.add(offset);
          if (page.total !== null) state.total = page.total;
          page.items.forEach((item, index) =>
            state.items.set(offset + index, item),
          );
        })
        .catch((error) => {
          if (!alive) return;
          failed.add(offset);
          fail(error);
        })
        .finally(() => {
          if (!alive) return;
          pending.delete(offset);
          state.loading = !pages.has(0) && !failed.has(0);
          publish();
          pump();
        });
    };
    const pump = () => {
      if (!alive) return;
      for (const offset of queued) {
        if (pending.size >= 2) break;
        queued.delete(offset);
        if (state.total !== null && offset >= state.total) continue;
        startPage(offset);
      }
    };
    const loadSummary = () => {
      void source
        .summary()
        .then((summary) => {
          if (!alive) return;
          state.summary = summary;
          summaryFailed = false;
          publish();
        })
        .catch((error) => {
          if (!alive) return;
          summaryFailed = true;
          fail(error);
          publish();
        });
    };
    demand.current = (start, end) => {
      if (!alive) return;
      for (
        let offset = Math.floor(start / PAGE_SIZE) * PAGE_SIZE;
        offset <= end;
        offset += PAGE_SIZE
      ) {
        if (!pages.has(offset) && !pending.has(offset) && !failed.has(offset))
          queued.add(offset);
      }
      pump();
    };
    retryRequest.current = () => {
      state.error = null;
      failed.forEach((offset) => queued.add(offset));
      failed.clear();
      if (summaryFailed) loadSummary();
      state.loading = !pages.has(0);
      publish();
      pump();
    };
    publish();
    loadSummary();
    demand.current(0, 0);
    return () => {
      alive = false;
    };
  }, [key, revision]);

  const requestRange = useCallback(
    ({ start, end }: { start: number; end: number }) =>
      demand.current(start, end),
    [],
  );
  const retry = useCallback(() => retryRequest.current(), []);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  return {
    ...(snapshot.key === key ? snapshot : empty(key)),
    requestRange,
    retry,
    refresh,
  };
}
