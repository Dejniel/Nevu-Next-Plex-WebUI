import type {
  LibraryCardDto,
  LibraryFilter,
  LibraryItemType,
  LibraryPageDto,
  LibraryPageRequest,
  LibrarySort,
} from "@nevu/contracts";
import { useSyncExternalStore } from "react";
import { getLibraryPage } from "../plex/libraryPage";

export const LIBRARY_RANGE_SIZE = 64;
const MAX_CACHED_QUERIES = 8;

export interface LibraryQuery {
  profileKey: string;
  sectionId: number;
  filter: LibraryFilter;
  type?: LibraryItemType;
  sort: LibrarySort;
  seed?: string;
}

export type LibraryRangeStatus = "queued" | "loading" | "loaded" | "error";

export interface LibraryRangeSnapshot {
  items: ReadonlyMap<number, LibraryCardDto>;
  ranges: ReadonlyMap<number, LibraryRangeStatus>;
  errors: ReadonlyMap<number, string>;
  totalSize: number | null;
  knownSize: number;
  viewGroup?: string;
  title?: string;
}

interface QueryState {
  key: string;
  query: LibraryQuery;
  slots: Map<number, string>;
  ranges: Map<number, LibraryRangeStatus>;
  errors: Map<number, string>;
  totalSize: number | null;
  knownSize: number;
  viewGroup?: string;
  title?: string;
  lastUsed: number;
  demand: Set<number>;
  snapshot: LibraryRangeSnapshot;
}

interface QueueTask {
  id: string;
  queryKey: string;
  offset: number;
  priority: number;
  sequence: number;
}

type PageFetcher = (request: LibraryPageRequest) => Promise<LibraryPageDto>;
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
};

const rangeStart = (index: number) =>
  Math.floor(Math.max(0, index) / LIBRARY_RANGE_SIZE) * LIBRARY_RANGE_SIZE;

export function libraryQueryKey(query: LibraryQuery) {
  return JSON.stringify([
    query.profileKey,
    query.sectionId,
    query.filter,
    query.type || "any",
    query.sort,
    query.seed || "",
  ]);
}

export class LibraryRangeStore {
  private readonly queries = new Map<string, QueryState>();
  private readonly entities = new Map<string, EntityState>();
  private readonly listeners = new Set<() => void>();
  private readonly queue = new Map<string, QueueTask>();
  private activeRequests = 0;
  private sequence = 0;

  constructor(
    private readonly fetchPage: PageFetcher = getLibraryPage,
    private readonly maxConcurrentRequests = 2,
  ) {}

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
        lastUsed: Date.now(),
        demand: new Set(),
        snapshot: EMPTY_SNAPSHOT,
      };
      this.queries.set(key, state);
      this.publish(state);
      this.prune();
    } else {
      state.lastUsed = Date.now();
    }
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

    const boundedEnd = state.totalSize === null
      ? Math.max(startIndex, endIndex)
      : Math.min(Math.max(0, state.totalSize - 1), Math.max(startIndex, endIndex));
    const first = rangeStart(startIndex);
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
      const status = state.ranges.get(offset);
      if (status === "loading" || status === "loaded" || status === "error") continue;
      const taskId = `${queryKey}:${offset}`;
      const center = offset + LIBRARY_RANGE_SIZE / 2;
      const outsideVisible = offset > visibleEnd || offset + LIBRARY_RANGE_SIZE <= visibleStart;
      const priority = Math.abs(center - visibleCenter) + (outsideVisible ? 100_000 : 0);
      const existing = this.queue.get(taskId);
      if (existing) existing.priority = priority;
      else {
        this.queue.set(taskId, {
          id: taskId,
          queryKey,
          offset,
          priority,
          sequence: this.sequence++,
        });
      }
      state.ranges.set(offset, "queued");
      state.errors.delete(offset);
    }

    this.publish(state);
    this.pump();
  }

  retry(queryKey: string, offset: number) {
    const state = this.queries.get(queryKey);
    if (!state) return;
    const start = rangeStart(offset);
    state.errors.delete(start);
    state.ranges.set(start, "queued");
    const id = `${queryKey}:${start}`;
    this.queue.set(id, {
      id,
      queryKey,
      offset: start,
      priority: -1,
      sequence: this.sequence++,
    });
    this.publish(state);
    this.pump();
  }

  release(queryKey: string) {
    const state = this.queries.get(queryKey);
    if (!state) return;
    state.demand.clear();
    for (const task of this.queue.values()) {
      if (task.queryKey !== queryKey) continue;
      this.queue.delete(task.id);
      if (state.ranges.get(task.offset) === "queued")
        state.ranges.delete(task.offset);
    }
    this.publish(state);
  }

  clear() {
    this.queries.clear();
    this.entities.clear();
    this.queue.clear();
    this.listeners.forEach((listener) => listener());
  }

  private pump() {
    while (this.activeRequests < this.maxConcurrentRequests && this.queue.size > 0) {
      const task = [...this.queue.values()].sort(
        (left, right) => left.priority - right.priority || left.sequence - right.sequence,
      )[0];
      this.queue.delete(task.id);
      const state = this.queries.get(task.queryKey);
      if (!state || state.ranges.get(task.offset) !== "queued") continue;
      state.ranges.set(task.offset, "loading");
      this.activeRequests += 1;
      this.publish(state);
      void this.run(task, state);
    }
  }

  private async run(task: QueueTask, state: QueryState) {
    try {
      const page = await this.fetchPage({
        sectionId: state.query.sectionId,
        filter: state.query.filter,
        ...(state.query.type && { type: state.query.type }),
        sort: state.query.sort,
        ...(state.query.seed && { seed: state.query.seed }),
        offset: task.offset,
        size: LIBRARY_RANGE_SIZE,
      });

      page.items.forEach((item, itemOffset) => {
        const entityKey = `${state.query.profileKey}:${item.ratingKey}`;
        const current = this.entities.get(entityKey);
        if (!current || current.requestSequence <= task.sequence)
          this.entities.set(entityKey, { item, requestSequence: task.sequence });
        state.slots.set(page.offset + itemOffset, entityKey);
      });
      state.ranges.set(task.offset, "loaded");
      state.errors.delete(task.offset);
      state.totalSize = page.totalSize ?? (page.hasMore ? state.totalSize : page.offset + page.items.length);
      state.knownSize = Math.max(state.knownSize, page.offset + page.items.length);
      state.viewGroup = page.viewGroup || state.viewGroup;
      state.title = page.title || state.title;
    } catch (error) {
      state.ranges.set(task.offset, "error");
      state.errors.set(
        task.offset,
        error instanceof Error ? error.message : "Unable to load this part of the library",
      );
    } finally {
      this.activeRequests -= 1;
      this.publish(state);
      this.pump();
    }
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
      ...(state.viewGroup && { viewGroup: state.viewGroup }),
      ...(state.title && { title: state.title }),
    };
    this.listeners.forEach((listener) => listener());
  }

  private prune() {
    if (this.queries.size <= MAX_CACHED_QUERIES) return;
    const removable = [...this.queries.values()]
      .filter((state) => ![...state.ranges.values()].includes("loading"))
      .sort((left, right) => left.lastUsed - right.lastUsed);
    while (this.queries.size > MAX_CACHED_QUERIES && removable.length > 0) {
      const state = removable.shift() as QueryState;
      this.queries.delete(state.key);
      for (const task of this.queue.values())
        if (task.queryKey === state.key) this.queue.delete(task.id);
    }
    const referencedEntities = new Set(
      [...this.queries.values()].flatMap((state) => [...state.slots.values()]),
    );
    for (const key of this.entities.keys())
      if (!referencedEntities.has(key)) this.entities.delete(key);
  }
}

export const libraryRangeStore = new LibraryRangeStore();

export function useLibraryRange(queryKey: string | null) {
  return useSyncExternalStore(
    libraryRangeStore.subscribe,
    () => libraryRangeStore.getSnapshot(queryKey),
    () => libraryRangeStore.getSnapshot(queryKey),
  );
}
