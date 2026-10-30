import {
  PlexResponseError,
  plexArray,
  plexContainer,
  plexInteger,
} from "./plexResponse";

/** A metadata page counts response rows, including repeated playlist occurrences. */
export function readPlexMetadataPage(
  value: unknown,
  resource: string,
  offset: number,
  pageSize: number,
) {
  const container = plexContainer(value, resource);
  const rows = plexArray(container.Metadata, resource);
  const total =
    container.totalSize === undefined
      ? undefined
      : plexInteger(container.totalSize, resource);
  if (
    rows.length > pageSize ||
    (container.offset !== undefined &&
      plexInteger(container.offset, resource) !== offset) ||
    (container.size !== undefined &&
      plexInteger(container.size, resource) !== rows.length) ||
    (total !== undefined &&
      (rows.length ? offset + rows.length > total : offset < total))
  )
    throw new PlexResponseError(resource);
  return { container, rows, total };
}

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
  const invalid = () => new PlexResponseError(resource);
  while (true) {
    signal?.throwIfAborted();
    const response = await fetchPage(offset);
    signal?.throwIfAborted();
    const page = readPlexMetadataPage(response, resource, offset, pageSize);
    const { rows } = page;
    if (page.total !== undefined) {
      if (total !== undefined && total !== page.total) throw invalid();
      total = page.total;
    }
    const previousSize = items.size;
    for (const row of rows) {
      const item = readItem(row);
      items.set(identity(item), item);
    }
    offset += rows.length;
    if (rows.length && items.size === previousSize) throw invalid();
    if (total !== undefined && offset > total) throw invalid();
    if (total !== undefined ? offset === total : rows.length < pageSize)
      return [...items.values()];
    if (!rows.length) throw invalid();
  }
}
