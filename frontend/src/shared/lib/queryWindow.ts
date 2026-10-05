import {
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
      const cancel = () => {
        void client.cancelQueries({ queryKey: pagePrefix });
      };
      signal.addEventListener("abort", cancel, { once: true });
      try {
        const first = await client.fetchQuery(pageOptions(revision, 0));
        const total = totalOf(first);
        const pages = new Map<number, T>([[0, first]]);
        // Consumers can scroll or join while the replacement is being prepared.
        while (true) {
          signal.throwIfAborted();
          const offsets = client
            .getQueryCache()
            .findAll({ queryKey: [...prefix, "page", published.revision] })
            .filter((page) => page.getObserversCount() > 0)
            .flatMap((page) => {
              const location = queryPageLocation(page.queryKey);
              return location ? [location.offset] : [];
            })
            .filter((offset) => !pages.has(offset) && (total === null || offset < total));
          if (!offsets.length) break;
          await Promise.all(
            offsets.map(async (offset) => {
              pages.set(offset, await client.fetchQuery(pageOptions(revision, offset)));
            }),
          );
        }
        validate([...pages.values()]);
        signal.throwIfAborted();
        return { revision };
      } catch (error) {
        await client.cancelQueries({ queryKey: pagePrefix });
        throw error;
      } finally {
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
