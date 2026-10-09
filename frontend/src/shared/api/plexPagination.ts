import {
  PlexResponseError,
  plexArray,
  plexContainer,
  plexInteger,
} from "./plexResponse";

/** Collect one checked resource before publishing it to Query. Offsets count
 * response rows, while identities deduplicate overlaps between pages. */
export async function readPlexMetadataPages<T>({
  resource,
  pageSize,
  fetchPage,
  readItem,
  identity,
  signal,
}: {
  resource: string;
  pageSize: number;
  fetchPage: (offset: number) => Promise<unknown>;
  readItem: (value: unknown) => T;
  identity: (item: T) => string;
  signal?: AbortSignal;
}): Promise<T[]> {
  const items = new Map<string, T>();
  let offset = 0;
  let total: number | undefined;
  const incomplete = () => new Error(`Plex returned incomplete ${resource}.`);
  while (true) {
    signal?.throwIfAborted();
    const container = plexContainer(await fetchPage(offset), resource);
    signal?.throwIfAborted();
    const rows = plexArray(container.Metadata, resource);
    if (rows.length > pageSize) throw new PlexResponseError(resource);
    if (
      container.offset !== undefined &&
      plexInteger(container.offset, resource) !== offset
    )
      throw incomplete();
    if (
      container.size !== undefined &&
      plexInteger(container.size, resource) !== rows.length
    )
      throw new PlexResponseError(resource);
    if (container.totalSize !== undefined) {
      const nextTotal = plexInteger(container.totalSize, resource);
      if (total !== undefined && total !== nextTotal) throw incomplete();
      total = nextTotal;
    }
    const previousSize = items.size;
    for (const row of rows) {
      const item = readItem(row);
      items.set(identity(item), item);
    }
    offset += rows.length;
    if (rows.length && items.size === previousSize) throw incomplete();
    if (total !== undefined && offset > total) throw incomplete();
    if (total !== undefined ? offset === total : rows.length < pageSize)
      return [...items.values()];
    if (!rows.length) throw incomplete();
  }
}
