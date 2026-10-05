interface Page<T> {
  offset: number;
  total: number | null;
  items: readonly T[];
  generationId?: string;
  hasMore?: boolean;
}

const pageTotal = <T>(page: Page<T>) =>
  page.total ??
  (page.hasMore === false ? page.offset + page.items.length : null);

/** Stage a replacement window before publishing any of its positions. */
export async function loadPageWindow<T>(
  fetchPage: (offset: number) => Promise<Page<T>>,
  offsets: readonly number[],
  concurrency = 2,
) {
  const first = await fetchPage(0);
  const firstTotal = pageTotal(first);
  const pages = new Map<number, Page<T>>([[0, first]]);
  const queue = [...new Set(offsets)].filter(
    (offset) => offset !== 0 && (firstTotal === null || offset < firstTotal),
  );
  let failed = false;
  const worker = async () => {
    while (queue.length && !failed) {
      const offset = queue.shift()!;
      try {
        pages.set(offset, await fetchPage(offset));
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  };
  const results = await Promise.allSettled(
    Array.from({ length: Math.min(concurrency, queue.length) }, worker),
  );
  for (const result of results)
    if (result.status === "rejected") throw result.reason;
  const items = new Map<number, T>();
  let total = firstTotal;
  for (const [offset, page] of pages) {
    const knownTotal = pageTotal(page);
    if (
      page.offset !== offset ||
      (total !== null && knownTotal !== null && knownTotal !== total) ||
      page.generationId !== first.generationId
    )
      throw new Error(
        "The list changed while it was loading. Please try again.",
      );
    if (knownTotal !== null) total = knownTotal;
    page.items.forEach((item, index) => items.set(offset + index, item));
  }
  return {
    items,
    total,
    offsets: [...pages.keys()],
    generationId: first.generationId,
  };
}
