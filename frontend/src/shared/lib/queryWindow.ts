import {
  matchQuery,
  queryOptions,
  type FetchQueryOptions,
  type QueryClient,
  type QueryKey,
} from "@tanstack/react-query";

export interface QueryWindow {
  revision: number;
}
let nextRevision = 0;
export const queryWindowKey = (prefix: QueryKey) => [...prefix, "window"] as const;

/** Coordinate publication only. Responses, observers and request state belong to Query. */
export function queryWindowOptions<T extends { offset: number }, TKey extends QueryKey>(
  client: QueryClient,
  prefix: QueryKey,
  pageOptions: (revision: number, offset: number) => FetchQueryOptions<T, Error, T, TKey>,
  totalOf: (first: T) => number | null,
  validate: (pages: readonly T[]) => void,
) {
  const key = queryWindowKey(prefix);
  return queryOptions({
    queryKey: key,
    initialData: (): QueryWindow => ({ revision: ++nextRevision }),
    refetchInterval: 60_000,
    queryFn: async ({ signal }): Promise<QueryWindow> => {
      const published = client.getQueryData<QueryWindow>(key)!;
      const revision = ++nextRevision;
      const pagePrefix = [...prefix, "page", revision];
      const publishedPrefix = [...prefix, "page", published.revision];
      const cache = client.getQueryCache();
      let changed = false;
      let wake: (() => void) | undefined;
      const notify = () => {
        changed = true;
        wake?.();
      };
      const unsubscribe = cache.subscribe((event) => {
        if (
          ((event.type === "observerAdded" || event.type === "observerRemoved") &&
            matchQuery({ queryKey: publishedPrefix }, event.query)) ||
          (event.type === "updated" && matchQuery({ queryKey: pagePrefix }, event.query))
        )
          notify();
      });
      const cancel = () => {
        void client.cancelQueries({ queryKey: pagePrefix });
        notify();
      };
      signal.addEventListener("abort", cancel, { once: true });
      try {
        const first = await client.fetchQuery(pageOptions(revision, 0));
        const total = totalOf(first);
        // Query's observers are the live demand, including while replacement reads run.
        while (true) {
          changed = false;
          signal.throwIfAborted();
          const offsets = new Set([0, ...cache
            .findAll({ queryKey: publishedPrefix })
            .filter((page) => page.getObserversCount() > 0)
            .flatMap((page) => {
              const location = queryPageLocation(page.queryKey);
              return location ? [location.offset] : [];
            })
            .filter((offset) => total === null || offset < total)]);
          const obsolete = cache.findAll({ queryKey: pagePrefix }).filter((page) =>
            page.state.fetchStatus !== "idle" &&
            !offsets.has(queryPageLocation(page.queryKey)!.offset),
          );
          if (obsolete.length) {
            await Promise.all(obsolete.map((page) =>
              client.cancelQueries({ queryKey: page.queryKey, exact: true }),
            ));
            continue;
          }
          const pages: T[] = [];
          for (const offset of offsets) {
            const options = pageOptions(revision, offset);
            const state = client.getQueryState<T>(options.queryKey);
            if (state?.status === "error") throw state.error;
            if (state?.data !== undefined) pages.push(state.data);
            else if (!state || state.fetchStatus === "idle") {
              // Completion/error wakes this loop through QueryCache. Query owns the result.
              void client.fetchQuery(options).catch(() => {});
            }
          }
          if (changed) continue;
          if (pages.length === offsets.size) {
            validate(pages);
            signal.throwIfAborted();
            return { revision };
          }
          await new Promise<void>((resolve) => { wake = resolve; });
          wake = undefined;
        }
      } catch (error) {
        await client.cancelQueries({ queryKey: pagePrefix });
        throw error;
      } finally {
        unsubscribe();
        signal.removeEventListener("abort", cancel);
      }
    },
  });
}

export function pageOffsets(start: number, end: number, total: number | null, size: number) {
  const offsets: number[] = [];
  const last = total === null ? end : Math.min(end, total - 1);
  for (let offset = Math.floor(Math.max(0, start) / size) * size; offset <= last; offset += size)
    offsets.push(offset);
  return offsets;
}

export function queryPageLocation(key: QueryKey) {
  const [kind, revision, offset, size] = key.slice(-4);
  return kind === "page" &&
    typeof revision === "number" &&
    typeof offset === "number" &&
    typeof size === "number"
    ? { revision, offset, size }
    : null;
}
export const isQueryWindowKey = (key: QueryKey) => key.at(-1) === "window";
