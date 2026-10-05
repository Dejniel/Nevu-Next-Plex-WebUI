import {
  hashKey,
  isCancelledError,
  QueryObserver,
  type QueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import { serverQueryClient } from "shared/api/queryClient";
import { loadPageWindow } from "./loadPageWindow";
import { RequestQueue } from "./RequestQueue";

export interface CollectionPage<T> {
  offset: number;
  total: number | null;
  items: readonly T[];
  hasMore?: boolean;
  generationId?: string;
}
export interface RangeError {
  message: string;
  retryable: boolean;
  status?: number;
}
export type RangeStatus = "queued" | "loading" | "loaded" | "error";
export interface CollectionSnapshot<T, Info = null> {
  items: ReadonlyMap<number, T>;
  ranges: ReadonlyMap<number, RangeStatus>;
  errors: ReadonlyMap<number, RangeError>;
  totalSize: number | null;
  knownSize: number;
  hasMore: boolean;
  info: Info | null;
  generationId?: string;
  refreshFailed?: boolean;
}
interface Options<T, Info> {
  pageSize: number;
  page: (
    offset: number,
    signal: AbortSignal,
    refresh: boolean,
  ) => Promise<CollectionPage<T>>;
  info?: (signal: AbortSignal) => Promise<Info | null>;
  identity?: (item: T) => string;
  describeError?: (error: unknown) => RangeError;
  refreshCatalog?: boolean;
  loadFirst?: boolean;
  finishInactivePages?: boolean;
  queue?: RequestQueue;
}
export const emptyCollection = <T, Info = null>(): CollectionSnapshot<
  T,
  Info
> => ({
  items: new Map(),
  ranges: new Map(),
  errors: new Map(),
  totalSize: null,
  knownSize: 0,
  hasMore: true,
  info: null,
});

const resources = new WeakMap<object, PagedCollection<unknown, unknown>>();
const observedClients = new WeakSet<QueryClient>();

/** Cache and request lifetimes are owned by Query. This adapter owns list positions. */
export function getPagedCollection<T, Info = null>(
  key: QueryKey,
  options: Options<T, Info>,
  client = serverQueryClient,
) {
  if (!observedClients.has(client)) {
    observedClients.add(client);
    client.getQueryCache().subscribe((event) => {
      if (event.type === "removed") resources.get(event.query)?.dispose();
    });
  }
  let query = client.getQueryCache().find({ queryKey: key, exact: true });
  if (query && resources.has(query))
    return resources.get(query)! as PagedCollection<T, Info>;
  const resource = new PagedCollection(key, options, client);
  query = client.getQueryCache().find({ queryKey: key, exact: true })!;
  resources.set(query, resource as PagedCollection<unknown, unknown>);
  return resource;
}
export function findPagedCollection<T, Info = null>(
  key: QueryKey,
  client: QueryClient,
) {
  const query = client.getQueryCache().find({ queryKey: key, exact: true });
  return query
    ? (resources.get(query) as PagedCollection<T, Info> | undefined)
    : undefined;
}

export class PagedCollection<T, Info = null> {
  private consumers = 0;
  private visible = new Set<number>();
  private observer: QueryObserver<CollectionSnapshot<T, Info>>;
  private unobserve?: () => void;
  private catalogPending = false;
  private needsCatalog: boolean;
  private readonly queue: RequestQueue;
  private readonly empty = emptyCollection<T, Info>();

  constructor(
    readonly key: QueryKey,
    private options: Options<T, Info>,
    private client: QueryClient,
  ) {
    this.needsCatalog = Boolean(options.refreshCatalog);
    this.queue = options.queue ?? new RequestQueue();
    this.observer = new QueryObserver(client, {
      queryKey: key,
      enabled: false,
      initialData: emptyCollection<T, Info>(),
    });
  }
  private alive() {
    return (
      this.client.getQueryCache().find({ queryKey: this.key, exact: true }) ===
      this.observer.getCurrentQuery()
    );
  }
  snapshot = () =>
    this.alive()
      ? this.client.getQueryData<CollectionSnapshot<T, Info>>(this.key)!
      : this.empty;
  subscribe = (listener: () => void) =>
    this.client.getQueryCache().subscribe((event) => {
      if (event.query.queryHash === hashKey(this.key)) listener();
    });
  private write(snapshot: CollectionSnapshot<T, Info>) {
    if (this.alive()) this.client.setQueryData(this.key, snapshot);
  }
  private error(error: unknown): RangeError {
    return (
      this.options.describeError?.(error) ?? {
        message:
          error instanceof Error ? error.message : "Could not load this list.",
        retryable: true,
      }
    );
  }
  private get refreshKey() {
    return [...this.key, "refresh"];
  }
  private get pageKey() {
    return [...this.key, "page"];
  }

  retain() {
    if (this.consumers++ !== 0) return;
    this.unobserve = this.observer.subscribe(() => {});
    if (this.snapshot().ranges.size) void this.refresh();
    else {
      if (this.options.info) void this.loadInfo();
      if (this.options.loadFirst) this.demand(0, 0);
    }
  }
  release() {
    if (this.consumers === 0 || --this.consumers > 0) return;
    this.unobserve?.();
    this.unobserve = undefined;
    if (!this.alive()) return;
    void this.client.cancelQueries({ queryKey: this.refreshKey });
    if (!this.options.finishInactivePages)
      void this.client.cancelQueries({ queryKey: this.pageKey });
    void this.client.cancelQueries({ queryKey: [...this.key, "info"] });
    this.queue.remove(this);
    this.visible.clear();
    const state = this.snapshot();
    const ranges = new Map(state.ranges);
    for (const [offset, status] of ranges)
      if (
        status === "queued" ||
        (status === "loading" && !this.options.finishInactivePages)
      )
        ranges.delete(offset);
    this.write({ ...state, ranges });
  }
  dispose() {
    this.unobserve?.();
    this.unobserve = undefined;
    this.consumers = 0;
    this.queue.remove(this);
    this.visible.clear();
    void this.client.cancelQueries({ queryKey: this.key });
  }

  demand(start: number, end: number, visibleStart = start, visibleEnd = end) {
    const state = this.snapshot();
    const maximum =
      state.totalSize !== null
        ? state.totalSize - 1
        : state.hasMore
          ? Math.max(start, end)
          : state.knownSize - 1;
    this.visible = new Set();
    if (maximum >= 0) {
      const first =
        Math.floor(
          Math.min(Math.max(0, start), maximum) / this.options.pageSize,
        ) * this.options.pageSize;
      const last =
        Math.floor(
          Math.min(Math.max(start, end), maximum) / this.options.pageSize,
        ) * this.options.pageSize;
      for (let offset = first; offset <= last; offset += this.options.pageSize)
        this.visible.add(offset);
    }
    this.queue.remove(this, this.visible);
    const ranges = new Map(state.ranges);
    for (const [offset, status] of ranges)
      if (status === "queued" && !this.visible.has(offset))
        ranges.delete(offset);
    if (
      this.needsCatalog &&
      ![...ranges.values()].some(
        (status) => status === "queued" || status === "loading",
      )
    )
      this.catalogPending = false;
    this.write({ ...state, ranges });
    const center = (visibleStart + visibleEnd) / 2;
    this.fill(
      (offset) =>
        Math.abs(offset + this.options.pageSize / 2 - center) +
        (offset > visibleEnd || offset + this.options.pageSize <= visibleStart
          ? 100_000
          : 0),
    );
  }

  retry(offset?: number) {
    if (this.snapshot().refreshFailed) {
      void this.refresh();
      return;
    }
    const state = this.snapshot();
    const errors = new Map(state.errors);
    const ranges = new Map(state.ranges);
    for (const [failed, error] of errors) {
      if ((offset !== undefined && failed !== offset) || !error.retryable)
        continue;
      errors.delete(failed);
      ranges.delete(failed);
      if (failed === -1) void this.loadInfo();
      else this.visible.add(failed);
    }
    this.write({ ...this.snapshot(), errors, ranges });
    this.fill();
  }

  private fill(priority = (_offset: number) => 0) {
    if (
      !this.alive() ||
      this.catalogPending ||
      this.snapshot().refreshFailed ||
      this.client.isFetching({ queryKey: this.refreshKey })
    )
      return;
    for (const offset of this.visible) {
      if (this.snapshot().ranges.has(offset)) continue;
      const refresh = this.needsCatalog;
      if (refresh) this.catalogPending = true;
      const state = this.snapshot();
      this.write({
        ...state,
        ranges: new Map(state.ranges).set(offset, "queued"),
      });
      this.queue.add({
        owner: this,
        offset,
        priority: priority(offset),
        run: () => this.loadPage(offset, refresh),
      });
      if (refresh) return;
    }
  }

  private async loadPage(offset: number, refresh: boolean) {
    const state = this.snapshot();
    if (!this.alive()) return;
    this.write({
      ...state,
      ranges: new Map(state.ranges).set(offset, "loading"),
    });
    try {
      await this.client.fetchQuery({
        queryKey: [...this.pageKey, state.generationId ?? null, offset],
        staleTime: 0,
        gcTime: 0,
        queryFn: async ({ signal }) => {
          const generation = this.snapshot().generationId;
          const page = await this.options.page(offset, signal, refresh);
          if (signal.aborted) return null;
          if (page.offset !== offset)
            throw new Error("Plex returned a mismatched list range.");
          let current = this.snapshot();
          if (page.generationId && page.generationId !== current.generationId) {
            if (generation !== current.generationId && current.generationId)
              return null;
            this.queue.remove(this);
            current = {
              ...emptyCollection<T, Info>(),
              info: current.info,
              generationId: page.generationId,
            };
          }
          const items = new Map(current.items);
          for (
            let index = offset;
            index < offset + this.options.pageSize;
            index++
          )
            items.delete(index);
          page.items.forEach((item, index) => items.set(offset + index, item));
          const totalSize =
            page.total ??
            (page.hasMore === false
              ? offset + page.items.length
              : current.totalSize);
          const knownSize = Math.min(
            Math.max(current.knownSize, offset + page.items.length),
            totalSize ?? Infinity,
          );
          if (totalSize !== null)
            for (const index of items.keys())
              if (index >= totalSize) items.delete(index);
          const errors = new Map(current.errors);
          const ranges = new Map(current.ranges).set(offset, "loaded" as const);
          errors.delete(offset);
          if (refresh) {
            this.needsCatalog = false;
            for (const failed of this.visible)
              if (ranges.get(failed) === "error") {
                ranges.delete(failed);
                errors.delete(failed);
              }
          }
          this.write({
            ...current,
            items,
            ranges,
            errors,
            totalSize,
            knownSize,
            hasMore:
              totalSize !== null
                ? knownSize < totalSize
                : (page.hasMore ?? true),
          });
          return null;
        },
      });
    } catch (error) {
      if (!isCancelledError(error) && this.alive()) {
        const current = this.snapshot();
        const errors = new Map(current.errors);
        const ranges = new Map(current.ranges);
        for (const failed of refresh ? this.visible : [offset]) {
          ranges.set(failed, "error");
          errors.set(failed, this.error(error));
        }
        this.write({ ...current, ranges, errors });
      }
    } finally {
      if (refresh) this.catalogPending = false;
      if (this.consumers) this.fill();
    }
  }

  private async loadInfo() {
    try {
      await this.client.fetchQuery({
        queryKey: [...this.key, "info"],
        staleTime: 0,
        gcTime: 0,
        queryFn: async ({ signal }) => {
          const info = await this.options.info!(signal);
          if (!signal.aborted) {
            const state = this.snapshot();
            const errors = new Map(state.errors);
            errors.delete(-1);
            this.write({ ...state, info, errors });
          }
          return null;
        },
      });
    } catch (error) {
      if (!isCancelledError(error) && this.alive()) {
        const state = this.snapshot();
        this.write({
          ...state,
          errors: new Map(state.errors).set(-1, this.error(error)),
        });
      }
    }
  }

  refresh(): Promise<void> {
    if (!this.alive() || !this.consumers) return Promise.resolve();
    return this.client
      .fetchQuery({
        queryKey: this.refreshKey,
        staleTime: 0,
        gcTime: 0,
        queryFn: async ({ signal }) => {
          this.queue.remove(this);
          await this.client.cancelQueries({ queryKey: this.pageKey });
          await this.client.cancelQueries({ queryKey: [...this.key, "info"] });
          signal.throwIfAborted();
          const state = this.snapshot();
          this.write({ ...state, errors: new Map(), refreshFailed: false });
          try {
            const [windowResult, infoResult] = await Promise.allSettled([
              loadPageWindow(
                async (offset) => {
                  signal.throwIfAborted();
                  return this.options.page(
                    offset,
                    signal,
                    offset === 0 && Boolean(this.options.refreshCatalog),
                  );
                },
                [...this.visible],
              ),
              this.options.info?.(signal) ?? Promise.resolve(state.info),
            ]);
            if (signal.aborted) return null;
            if (windowResult.status === "rejected") throw windowResult.reason;
            if (infoResult.status === "rejected") throw infoResult.reason;
            const window = windowResult.value;
            const info = infoResult.value;
            if (this.options.identity) {
              const ids = [...window.items.values()].map(this.options.identity);
              if (new Set(ids).size !== ids.length)
                throw new Error(
                  "The list changed while it was loading. Please try again.",
                );
            }
            const knownSize = Math.max(
              0,
              ...[...window.items.keys()].map((index) => index + 1),
            );
            this.needsCatalog = false;
            this.write({
              items: window.items,
              ranges: new Map(
                window.offsets.map((offset) => [offset, "loaded"]),
              ),
              errors: new Map(),
              totalSize: window.total,
              knownSize,
              hasMore: window.total === null || knownSize < window.total,
              info,
              generationId: window.generationId,
            });
            return null;
          } catch (error) {
            if (!signal.aborted)
              this.write({
                ...this.snapshot(),
                refreshFailed: true,
                errors: new Map([[0, this.error(error)]]),
              });
            throw error;
          }
        },
      })
      .then(
        () => undefined,
        () => undefined,
      )
      .finally(() => {
        if (this.consumers) this.fill();
      });
  }
}
