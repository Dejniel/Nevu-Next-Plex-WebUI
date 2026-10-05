import type {
  LibraryCardDto,
  LibraryFilterExpression,
  LibraryItemType,
  LibraryPageDto,
  LibraryPageRequest,
  LibrarySource,
  LibrarySort,
} from "@nevu/contracts";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { subscribeToLibraryCache } from "shared/lib/libraryCache";
import { loadPageWindow } from "shared/lib/loadPageWindow";
import { useAutoRefresh } from "shared/lib/useAutoRefresh";
import { getLibraryPage, LibraryPageError } from "../api/libraryPage";
import { libraryFilterExpressionKey } from "./libraryFilterExpression";
import { isRandomLibrarySort } from "./librarySort";

export const LIBRARY_RANGE_SIZE = 64;
const MAX_CACHED_QUERIES = 8;

export interface LibraryQuery {
  profileKey: string;
  sectionId: number;
  source?: LibrarySource;
  type?: LibraryItemType;
  sort: LibrarySort;
  filterExpression?: LibraryFilterExpression;
  seed?: string;
}

type LibraryRangeStatus =
  | "queued"
  | "loading"
  | "loaded"
  | "stale"
  | "error";

interface LibraryRangeError {
  message: string;
  retryable: boolean;
  status?: number;
}

export interface LibraryRangeSnapshot {
  items: ReadonlyMap<number, LibraryCardDto>;
  ranges: ReadonlyMap<number, LibraryRangeStatus>;
  errors: ReadonlyMap<number, LibraryRangeError>;
  totalSize: number | null;
  knownSize: number;
  hasMore: boolean;
}

interface QueryState {
  key: string;
  query: LibraryQuery;
  slots: Map<number, string>;
  ranges: Map<number, LibraryRangeStatus>;
  errors: Map<number, LibraryRangeError>;
  totalSize: number | null;
  knownSize: number;
  hasMore: boolean;
  generationId?: string;
  generationSequence: number;
  lastUsed: number;
  demand: Set<number>;
  consumers: number;
  acceptAfterSequence: number;
  requiresCatalogRefresh: boolean;
  catalogRefreshInFlight: boolean;
  snapshot: LibraryRangeSnapshot;
  replacement?: Promise<void>;
  replacementError?: boolean;
  replacementController?: AbortController;
}

interface QueueTask {
  id: string;
  queryKey: string;
  offset: number;
  priority: number;
  sequence: number;
  epoch: number;
  refresh?: boolean;
}

type PageFetcher = (
  request: LibraryPageRequest,
  signal?: AbortSignal,
) => Promise<LibraryPageDto>;

interface EntityState {
  item: LibraryCardDto;
  requestSequence: number;
}

const EMPTY_SNAPSHOT: LibraryRangeSnapshot = {
  items: new Map(),
  ranges: new Map(),
  errors: new Map(),
  totalSize: null,
  knownSize: 0,
  hasMore: true,
};

const rangeStart = (index: number) =>
  Math.floor(Math.max(0, index) / LIBRARY_RANGE_SIZE) * LIBRARY_RANGE_SIZE;

export function libraryQueryKey(query: LibraryQuery) {
  return JSON.stringify([
    query.profileKey,
    query.sectionId,
    query.source || "all",
    query.type || "any",
    query.sort,
    libraryFilterExpressionKey(query.filterExpression),
    query.seed || "",
  ]);
}

export function useLibraryQueryRange(query: LibraryQuery | null | undefined) {
  const queryKey = useMemo(() => query ? libraryQueryKey(query) : null, [query]);
  const range = useLibraryRange(queryKey);
  const refresh = useAutoRefresh(queryKey, () =>
    queryKey ? libraryRangeStore.revalidateQuery(queryKey) : undefined,
  );

  useEffect(() => {
    if (!query) return;
    const key = libraryRangeStore.ensure(query);
    return () => libraryRangeStore.release(key);
    // The serialized key is the query identity. Depending on the object reference
    // releases live demand when URL normalization recreates an equivalent query.
    // oxlint-disable-next-line react/exhaustive-deps
  }, [queryKey]);

  useEffect(
    () => subscribeToLibraryCache((action, scope) => {
      if (action !== "invalidate" || !query) return;
      if (scope?.profileKey && scope.profileKey !== query.profileKey) return;
      if (scope?.sectionId && scope.sectionId !== String(query.sectionId)) return;
      refresh.current?.invalidate();
    }),
    [query, refresh],
  );

  return { queryKey, range };
}

export class LibraryRangeStore {
  private readonly queries = new Map<string, QueryState>();
  private readonly entities = new Map<string, EntityState>();
  private readonly listeners = new Set<() => void>();
  private readonly queue = new Map<string, QueueTask>();
  private activeRequests = 0;
  private sequence = 0;
  private epoch = 0;

  constructor(
    private readonly fetchPage: PageFetcher = getLibraryPage,
    private readonly maxConcurrentRequests = 2,
  ) {
    if (!Number.isInteger(maxConcurrentRequests) || maxConcurrentRequests < 1)
      throw new Error("Library range store must allow at least one request");
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (queryKey: string | null) => {
    if (!queryKey) return EMPTY_SNAPSHOT;
    return this.queries.get(queryKey)?.snapshot || EMPTY_SNAPSHOT;
  };

  ensure(query: LibraryQuery) {
    const key = libraryQueryKey(query);
    let state = this.queries.get(key);
    if (!state) {
      state = {
        key,
        query,
        slots: new Map(),
        ranges: new Map(),
        errors: new Map(),
        totalSize: null,
        knownSize: 0,
        hasMore: true,
        generationSequence: -1,
        lastUsed: Date.now(),
        demand: new Set(),
        consumers: 1,
        acceptAfterSequence: 0,
        requiresCatalogRefresh: isRandomLibrarySort(query.sort),
        catalogRefreshInFlight: false,
        snapshot: EMPTY_SNAPSHOT,
      };
      this.queries.set(key, state);
      this.publish(state);
    } else {
      const wasInactive = state.consumers === 0;
      state.consumers += 1;
      state.lastUsed = Date.now();
      if (wasInactive) void this.revalidateQuery(key);
    }
    this.prune();
    return key;
  }

  demand(
    queryKey: string,
    startIndex: number,
    endIndex: number,
    visibleStart = startIndex,
    visibleEnd = endIndex,
  ) {
    const state = this.queries.get(queryKey);
    if (!state) return;
    state.lastUsed = Date.now();

    const maximumIndex = state.totalSize !== null
      ? state.totalSize - 1
      : state.hasMore
        ? Math.max(startIndex, endIndex)
        : state.knownSize - 1;
    if (maximumIndex < 0) {
      state.demand.clear();
      return;
    }

    const boundedStart = Math.min(Math.max(0, startIndex), maximumIndex);
    const boundedEnd = Math.min(Math.max(boundedStart, endIndex), maximumIndex);
    const first = rangeStart(boundedStart);
    const last = rangeStart(boundedEnd);
    const nextDemand = new Set<number>();
    for (let offset = first; offset <= last; offset += LIBRARY_RANGE_SIZE)
      nextDemand.add(offset);
    state.demand = nextDemand;

    for (const task of this.queue.values()) {
      if (task.queryKey === queryKey && !nextDemand.has(task.offset)) {
        this.queue.delete(task.id);
        if (state.ranges.get(task.offset) === "queued")
          state.ranges.delete(task.offset);
      }
    }

    const visibleCenter = (visibleStart + visibleEnd) / 2;
    for (const offset of nextDemand) {
      const center = offset + LIBRARY_RANGE_SIZE / 2;
      const outsideVisible = offset > visibleEnd || offset + LIBRARY_RANGE_SIZE <= visibleStart;
      this.queueRange(
        state,
        offset,
        Math.abs(center - visibleCenter) + (outsideVisible ? 100_000 : 0),
      );
    }

    this.publish(state);
    this.pump();
  }

  retry(queryKey: string, offset: number) {
    const state = this.queries.get(queryKey);
    if (!state) return;
    if (state.replacementError) { void this.revalidateQuery(queryKey); return; }
    const start = rangeStart(offset);
    const error = state.errors.get(start);
    const status = state.ranges.get(start);
    if (error && !error.retryable) return;
    if (status === "loading" || status === "queued") return;
    state.errors.delete(start);
    state.ranges.delete(start);
    this.queueRange(state, start, -1);
    this.publish(state);
    this.pump();
  }

  invalidateQuery(queryKey: string) {
    void this.revalidateQuery(queryKey);
  }

  revalidateQuery(queryKey: string): Promise<void> {
    const state = this.queries.get(queryKey);
    if (!state || state.consumers === 0) return Promise.resolve();
    if (state.replacement) return state.replacement;
    const sequence = this.sequence++;
    const epoch = this.epoch;
    const controller = new AbortController();
    state.replacementController = controller;
    state.acceptAfterSequence = sequence;
    state.errors.clear();
    for (const task of this.queue.values())
      if (task.queryKey === queryKey) this.queue.delete(task.id);
    const current = () =>
      !controller.signal.aborted &&
      state.consumers > 0 &&
      this.epoch === epoch &&
      this.queries.get(queryKey) === state &&
      state.acceptAfterSequence === sequence;
    const replacement = Promise.resolve()
      .then(() =>
        loadPageWindow(
          async (offset) => {
            if (!current()) throw new Error("The active library changed.");
            const page = await this.fetchPage(
              this.pageRequest(
                state,
                offset,
                offset === 0 && isRandomLibrarySort(state.query.sort),
              ),
              controller.signal,
            );
            return { ...page, total: page.totalSize };
          },
          [...state.demand],
        ),
      )
      .then((window) => {
        if (!current()) return;
        const seen = new Set<string>();
        const slots = new Map<number, string>();
        for (const [index, item] of window.items) {
          if (seen.has(item.ratingKey))
            throw new Error(
              "The library changed while it was loading. Please try again.",
            );
          seen.add(item.ratingKey);
          slots.set(index, `${state.query.profileKey}:${item.ratingKey}`);
        }
        window.items.forEach((item, index) => {
          const entityKey = slots.get(index)!;
          const previous = this.entities.get(entityKey);
          if (!previous || previous.requestSequence <= sequence)
            this.entities.set(entityKey, { item, requestSequence: sequence });
        });
        state.slots = slots;
        state.ranges = new Map(
          window.offsets.map((offset) => [offset, "loaded"]),
        );
        state.totalSize = window.total;
        state.knownSize = Math.max(
          0,
          ...[...slots.keys()].map((index) => index + 1),
        );
        state.hasMore = window.total === null || state.knownSize < window.total;
        state.generationId = window.generationId;
        state.generationSequence = sequence;
        state.requiresCatalogRefresh = false;
        state.replacementError = false;
      })
      .catch((error) => {
        if (!current()) return;
        state.replacementError = true;
        state.errors.set(0, {
          message:
            error instanceof Error
              ? error.message
              : "Could not refresh this library.",
          retryable: true,
        });
      })
      .finally(() => {
        if (state.replacement !== replacement) return;
        state.replacement = undefined;
        state.replacementController = undefined;
        if (!this.queries.has(queryKey) || epoch !== this.epoch) return;
        for (const task of this.queue.values())
          if (task.queryKey === queryKey) this.queue.delete(task.id);
        if (!state.replacementError) {
          let priority = 0;
          for (const offset of state.demand)
            this.queueRange(state, offset, priority++);
        }
        this.publish(state);
        this.pruneEntities();
        this.pump();
      });
    state.replacement = replacement;
    return replacement;
  }

  drop(queryKey: string) {
    const state = this.queries.get(queryKey);
    if (!state) return;
    state.replacementController?.abort();
    this.queries.delete(queryKey);
    for (const task of this.queue.values())
      if (task.queryKey === queryKey) this.queue.delete(task.id);
    this.pruneEntities();
    this.listeners.forEach((listener) => listener());
  }

  release(queryKey: string) {
    const state = this.queries.get(queryKey);
    if (!state) return;
    state.consumers = Math.max(0, state.consumers - 1);
    if (state.consumers > 0) return;

    state.replacementController?.abort();
    state.replacementController = undefined;
    state.replacement = undefined;

    state.demand.clear();
    for (const task of this.queue.values()) {
      if (task.queryKey !== queryKey) continue;
      this.queue.delete(task.id);
      if (state.ranges.get(task.offset) === "queued")
        state.ranges.delete(task.offset);
    }
    this.publish(state);
    this.prune();
  }

  clear() {
    this.epoch += 1;
    this.queries.forEach((state) => state.replacementController?.abort());
    this.queries.clear();
    this.entities.clear();
    this.queue.clear();
    this.listeners.forEach((listener) => listener());
  }

  private queueRange(state: QueryState, offset: number, priority: number) {
    const status = state.ranges.get(offset);
    if (["queued", "loading", "loaded", "error"].includes(status || "")) return;

    const id = `${state.key}:${offset}`;
    const existing = this.queue.get(id);
    if (existing) existing.priority = priority;
    else {
      this.queue.set(id, {
        id,
        queryKey: state.key,
        offset,
        priority,
        sequence: this.sequence++,
        epoch: this.epoch,
      });
    }
    state.ranges.set(offset, "queued");
    state.errors.delete(offset);
  }

  private pump() {
    while (this.activeRequests < this.maxConcurrentRequests && this.queue.size > 0) {
      const task = [...this.queue.values()]
        .sort((left, right) => left.priority - right.priority || left.sequence - right.sequence)
        .find((candidate) => {
          const state = this.queries.get(candidate.queryKey);
          return state &&
            state.ranges.get(candidate.offset) === "queued" &&
            !state.replacement &&
            !state.replacementError &&
            !state.catalogRefreshInFlight;
        });
      if (!task) return;

      this.queue.delete(task.id);
      const state = this.queries.get(task.queryKey);
      if (!state || state.ranges.get(task.offset) !== "queued") continue;

      if (state.requiresCatalogRefresh) {
        task.refresh = true;
        state.requiresCatalogRefresh = false;
        state.catalogRefreshInFlight = true;
      }
      state.ranges.set(task.offset, "loading");
      this.activeRequests += 1;
      this.publish(state);
      void this.run(task, state);
    }
  }

  private async run(task: QueueTask, state: QueryState) {
    try {
      const page = await this.fetchPage(this.pageRequest(state, task.offset, task.refresh));

      if (!this.isCurrent(task, state) || task.sequence < state.acceptAfterSequence) return;
      if (page.offset !== task.offset)
        throw new LibraryPageError("Plex returned a mismatched library range", false);

      if (page.generationId && state.generationId !== page.generationId) {
        if (state.generationId && task.sequence < state.generationSequence) return;
        this.resetGeneration(state, page.generationId, task.sequence);
      }

      for (let index = task.offset; index < task.offset + LIBRARY_RANGE_SIZE; index += 1)
        state.slots.delete(index);

      page.items.forEach((item, itemOffset) => {
        const entityKey = `${state.query.profileKey}:${item.ratingKey}`;
        const current = this.entities.get(entityKey);
        if (!current || current.requestSequence <= task.sequence)
          this.entities.set(entityKey, { item, requestSequence: task.sequence });
        state.slots.set(page.offset + itemOffset, entityKey);
      });

      state.ranges.set(task.offset, "loaded");
      state.errors.delete(task.offset);
      state.totalSize = page.totalSize ??
        (page.hasMore ? state.totalSize : page.offset + page.items.length);
      state.knownSize = Math.max(state.knownSize, page.offset + page.items.length);

      if (state.totalSize !== null) {
        state.knownSize = Math.min(state.knownSize, state.totalSize);
        state.hasMore = state.knownSize < state.totalSize;
        for (const index of state.slots.keys())
          if (index >= state.totalSize) state.slots.delete(index);
      } else state.hasMore = page.hasMore;

      if (task.refresh) {
        for (const offset of state.demand) {
          if (offset === task.offset || state.ranges.get(offset) !== "error") continue;
          state.ranges.delete(offset);
          state.errors.delete(offset);
        }
      }

      let priority = 0;
      for (const offset of state.demand) this.queueRange(state, offset, priority++);
    } catch (error) {
      if (!this.isCurrent(task, state) || task.sequence < state.acceptAfterSequence) return;
      const pageError = error instanceof LibraryPageError ? error : null;
      const rangeError: LibraryRangeError = {
        message: error instanceof Error ? error.message : "Unable to load this part of the library",
        retryable: pageError?.retryable ?? true,
        ...(pageError?.status && { status: pageError.status }),
      };
      state.ranges.set(task.offset, "error");
      state.errors.set(task.offset, rangeError);
      if (task.refresh) {
        state.requiresCatalogRefresh = true;
        for (const queued of this.queue.values()) {
          if (queued.queryKey !== state.key) continue;
          this.queue.delete(queued.id);
          state.ranges.set(queued.offset, "error");
          state.errors.set(queued.offset, rangeError);
        }
      }
    } finally {
      this.activeRequests -= 1;
      if (this.isCurrent(task, state)) {
        if (task.refresh) state.catalogRefreshInFlight = false;
        this.publish(state);
      }
      this.prune();
      this.pump();
    }
  }

  private pageRequest(state: QueryState, offset: number, refresh?: boolean): LibraryPageRequest {
    return {
      sectionId: state.query.sectionId,
      ...(state.query.source && { source: state.query.source }),
      ...(state.query.type && { type: state.query.type }),
      sort: state.query.sort,
      ...(state.query.filterExpression && { filterExpression: state.query.filterExpression }),
      ...(state.query.seed && { seed: state.query.seed }),
      ...(refresh && { refresh: true }),
      offset, size: LIBRARY_RANGE_SIZE,
    };
  }

  private resetGeneration(state: QueryState, generationId: string, sequence: number) {
    state.slots.clear();
    state.ranges.clear();
    state.errors.clear();
    state.totalSize = null;
    state.knownSize = 0;
    state.hasMore = true;
    state.generationId = generationId;
    state.generationSequence = sequence;

    for (const task of this.queue.values())
      if (task.queryKey === state.key) this.queue.delete(task.id);
  }

  private isCurrent(task: QueueTask, state: QueryState) {
    return task.epoch === this.epoch && this.queries.get(task.queryKey) === state;
  }

  private publish(state: QueryState) {
    const items = new Map<number, LibraryCardDto>();
    state.slots.forEach((entityKey, index) => {
      const entity = this.entities.get(entityKey);
      if (entity) items.set(index, entity.item);
    });
    state.snapshot = {
      items,
      ranges: new Map(state.ranges),
      errors: new Map(state.errors),
      totalSize: state.totalSize,
      knownSize: state.knownSize,
      hasMore: state.hasMore,
    };
    this.listeners.forEach((listener) => listener());
  }

  private prune() {
    if (this.queries.size > MAX_CACHED_QUERIES) {
      const removable = [...this.queries.values()]
        .filter((state) =>
          state.consumers === 0 &&
          ![...state.ranges.values()].includes("loading"))
        .sort((left, right) => left.lastUsed - right.lastUsed);
      while (this.queries.size > MAX_CACHED_QUERIES && removable.length > 0) {
        const state = removable.shift() as QueryState;
        this.queries.delete(state.key);
        for (const task of this.queue.values())
          if (task.queryKey === state.key) this.queue.delete(task.id);
      }
    }
    this.pruneEntities();
  }

  private pruneEntities() {
    const referencedEntities = new Set(
      [...this.queries.values()].flatMap((state) => [...state.slots.values()]),
    );
    for (const key of this.entities.keys())
      if (!referencedEntities.has(key)) this.entities.delete(key);
  }
}

export const libraryRangeStore = new LibraryRangeStore();

subscribeToLibraryCache((action) => {
  if (action === "clear") libraryRangeStore.clear();
});

export function useLibraryRange(queryKey: string | null) {
  return useSyncExternalStore(
    libraryRangeStore.subscribe,
    () => libraryRangeStore.getSnapshot(queryKey),
    () => libraryRangeStore.getSnapshot(queryKey),
  );
}
