import type {
  LibraryCardDto,
  LibraryFilterGroup,
  LibraryPageDto,
  LibraryPageRequest,
} from "@nevu/contracts";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import {
  LibraryQuery,
  LibraryRangeStore,
  libraryRangeStore,
  libraryQueryKey,
  useLibraryQueryRange,
} from "./LibraryRangeStore";
import { LibraryPageError } from "../api/libraryPage";

const reactActEnvironment = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};
const previousReactActEnvironment = reactActEnvironment.IS_REACT_ACT_ENVIRONMENT;

beforeAll(() => {
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(() => {
  if (previousReactActEnvironment === undefined)
    delete reactActEnvironment.IS_REACT_ACT_ENVIRONMENT;
  else reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = previousReactActEnvironment;
});

const query = (overrides: Partial<LibraryQuery> = {}): LibraryQuery => ({
  profileKey: "owner",
  sectionId: 1,
  sort: "title:asc",
  ...overrides,
});

const card = (ratingKey: string, title = `Movie ${ratingKey}`): LibraryCardDto => ({
  ratingKey,
  guid: `plex://movie/${ratingKey}`,
  type: "movie",
  title,
});

const page = (
  request: LibraryPageRequest,
  items: LibraryCardDto[],
  totalSize = 300,
): LibraryPageDto => ({
  offset: request.offset,
  size: items.length,
  totalSize,
  hasMore: request.offset + items.length < totalSize,
  items,
});

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function QueryRetentionHarness({ value }: { value: LibraryQuery | null }) {
  useLibraryQueryRange(value);
  return null;
}

it("retains a canonical query when an equivalent object replaces it", () => {
  libraryRangeStore.clear();
  const ensure = jest.spyOn(libraryRangeStore, "ensure");
  const release = jest.spyOn(libraryRangeStore, "release");
  const root = createRoot(document.createElement("div"));
  const first = query();

  act(() => root.render(React.createElement(QueryRetentionHarness, { value: first })));
  expect(ensure).toHaveBeenCalledTimes(1);
  expect(release).not.toHaveBeenCalled();

  act(() => root.render(React.createElement(QueryRetentionHarness, {
    value: { ...first },
  })));
  expect(ensure).toHaveBeenCalledTimes(1);
  expect(release).not.toHaveBeenCalled();

  const changed = { ...first, sort: "year:desc" as const };
  act(() => root.render(React.createElement(QueryRetentionHarness, { value: changed })));
  expect(release).toHaveBeenCalledTimes(1);
  expect(release).toHaveBeenLastCalledWith(libraryQueryKey(first));
  expect(ensure).toHaveBeenCalledTimes(2);

  act(() => root.unmount());
  expect(release).toHaveBeenCalledTimes(2);
  expect(release).toHaveBeenLastCalledWith(libraryQueryKey(changed));

  ensure.mockRestore();
  release.mockRestore();
  libraryRangeStore.clear();
});

it("separates range caches by canonical filter clauses, not display labels", () => {
  const first = query({
    filterExpression: {
      kind: "clause", field: "genre", operator: "=", value: "4", valueLabel: "Action",
    },
  });
  const same = query({
    filterExpression: {
      kind: "clause", field: "genre", operator: "=", value: "4", valueLabel: "Akcja",
    },
  });
  const other = query({
    filterExpression: {
      kind: "clause", field: "genre", operator: "=", value: "5", valueLabel: "Comedy",
    },
  });
  const filterExpression: LibraryFilterGroup = {
    kind: "group",
    mode: "and",
    children: [
      { kind: "clause", field: "genre", operator: "=", value: "4" },
      { kind: "clause", field: "year", operator: ">=", value: "2020" },
    ],
  };
  const all = query({ filterExpression });
  const any = query({
    filterExpression: {
      ...filterExpression,
      mode: "or",
    },
  });

  expect(libraryQueryKey(first)).toBe(libraryQueryKey(same));
  expect(libraryQueryKey(first)).not.toBe(libraryQueryKey(other));
  expect(libraryQueryKey(all)).not.toBe(libraryQueryKey(any));
});

it("separates section collections from special sources", () => {
  expect(libraryQueryKey(query())).not.toBe(
    libraryQueryKey(query({ source: "onDeck" })),
  );
});

it("forwards the collection source to the page request", async () => {
  const requests: LibraryPageRequest[] = [];
  const store = new LibraryRangeStore(async (request) => {
    requests.push(request);
    return page(request, [], 0);
  });
  const key = store.ensure(query({ source: "onDeck" }));

  store.demand(key, 0, 10);
  await flush();

  expect(requests[0].source).toBe("onDeck");
});

it("places an independently loaded range at its absolute indices", async () => {
  const requests: LibraryPageRequest[] = [];
  const store = new LibraryRangeStore(async (request) => {
    requests.push(request);
    return page(request, [card("128")]);
  });
  const key = store.ensure(query());

  store.demand(key, 128, 191, 128, 191);
  await flush();

  expect(requests).toHaveLength(1);
  expect(requests[0].offset).toBe(128);
  expect(store.getSnapshot(key).items.get(128)?.ratingKey).toBe("128");
  expect(store.getSnapshot(key).items.has(0)).toBe(false);
  expect(store.getSnapshot(key).totalSize).toBe(300);
});

it("limits concurrency and drops only stale queued ranges", async () => {
  const started: number[] = [];
  const resolvers = new Map<number, (value: LibraryPageDto) => void>();
  const store = new LibraryRangeStore((request) => {
    started.push(request.offset);
    return new Promise((resolve) => resolvers.set(request.offset, resolve));
  }, 2);
  const key = store.ensure(query());

  store.demand(key, 0, 255, 0, 63);
  expect(started).toEqual([0, 64]);

  store.demand(key, 192, 255, 192, 255);
  resolvers.get(0)?.(page({ ...query(), offset: 0, size: 64 }, [], 256));
  resolvers.get(64)?.(page({ ...query(), offset: 64, size: 64 }, [], 256));
  await flush();

  expect(started).toEqual([0, 64, 192]);
  expect(started).not.toContain(128);
  resolvers.get(192)?.(page({ ...query(), offset: 192, size: 64 }, [], 256));
  await flush();
});

it("keeps late responses in their own query cache", async () => {
  const resolvers = new Map<string, (value: LibraryPageDto) => void>();
  const store = new LibraryRangeStore((request) => new Promise((resolve) => {
    resolvers.set(`${request.sort}:${request.offset}`, resolve);
  }), 2);
  const firstQuery = query({ sort: "title:asc" });
  const secondQuery = query({ sort: "year:desc" });
  const firstKey = store.ensure(firstQuery);
  store.demand(firstKey, 0, 63);
  store.release(firstKey);
  const secondKey = store.ensure(secondQuery);
  store.demand(secondKey, 0, 63);

  resolvers.get("year:desc:0")?.({
    offset: 0, size: 1, totalSize: 1, hasMore: false, items: [card("2", "Current")],
  });
  resolvers.get("title:asc:0")?.({
    offset: 0, size: 1, totalSize: 1, hasMore: false, items: [card("1", "Late")],
  });
  await flush();

  expect(store.getSnapshot(secondKey).items.get(0)?.title).toBe("Current");
  expect(store.getSnapshot(firstKey).items.get(0)?.title).toBe("Late");
  expect(libraryQueryKey(secondQuery)).toBe(secondKey);
});

it("exposes failed ranges and retries them explicitly", async () => {
  let attempts = 0;
  const store = new LibraryRangeStore(async (request) => {
    attempts += 1;
    if (attempts === 1) throw new Error("Plex is unavailable");
    return page(request, [card("1")], 1);
  });
  const key = store.ensure(query());
  store.demand(key, 0, 63);
  await flush();

  expect(store.getSnapshot(key).ranges.get(0)).toBe("error");
  expect(store.getSnapshot(key).errors.get(0)?.message).toBe("Plex is unavailable");
  store.retry(key, 0);
  await flush();
  expect(store.getSnapshot(key).ranges.get(0)).toBe("loaded");
  expect(store.getSnapshot(key).items.get(0)?.ratingKey).toBe("1");
});

it("continues past a full range when totalSize is unknown", async () => {
  const requests: LibraryPageRequest[] = [];
  const store = new LibraryRangeStore(async (request) => {
    requests.push(request);
    if (request.offset === 0) {
      const items = Array.from({ length: 64 }, (_, index) => card(String(index)));
      return { offset: 0, size: 64, totalSize: null, hasMore: true, items };
    }
    return { offset: 64, size: 1, totalSize: null, hasMore: false, items: [card("64")] };
  });
  const key = store.ensure(query());

  store.demand(key, 0, 63);
  await flush();
  expect(store.getSnapshot(key).knownSize).toBe(64);
  expect(store.getSnapshot(key).hasMore).toBe(true);

  store.demand(key, 64, 64);
  await flush();
  expect(requests.map((request) => request.offset)).toEqual([0, 64]);
  expect(store.getSnapshot(key).totalSize).toBe(65);
  expect(store.getSnapshot(key).hasMore).toBe(false);
});

it("rechecks an empty cached library when its query is reactivated", async () => {
  const requests: LibraryPageRequest[] = [];
  const store = new LibraryRangeStore(async (request) => {
    requests.push(request);
    return page(request, [], 0);
  });
  const libraryQuery = query();
  const key = store.ensure(libraryQuery);
  store.demand(key, 0, 0);
  await flush();
  expect(store.getSnapshot(key).totalSize).toBe(0);

  store.release(key);
  store.ensure(libraryQuery);
  expect(store.getSnapshot(key).totalSize).toBeNull();
  store.demand(key, 0, 0);
  await flush();
  expect(requests).toHaveLength(2);
});

it("keeps an unknown-size tail closed when an earlier page finishes later", async () => {
  const resolvers = new Map<number, (value: LibraryPageDto) => void>();
  const store = new LibraryRangeStore((request) => new Promise((resolve) => {
    resolvers.set(request.offset, resolve);
  }), 2);
  const key = store.ensure(query());
  store.demand(key, 0, 127, 0, 127);

  resolvers.get(64)?.({
    offset: 64, size: 1, totalSize: null, hasMore: false, items: [card("64")],
  });
  await flush();
  resolvers.get(0)?.({
    offset: 0,
    size: 64,
    totalSize: null,
    hasMore: true,
    items: Array.from({ length: 64 }, (_, index) => card(String(index))),
  });
  await flush();

  expect(store.getSnapshot(key).totalSize).toBe(65);
  expect(store.getSnapshot(key).hasMore).toBe(false);
});

it("drops every old random slot when the catalog generation changes", async () => {
  let generation = "generation-a";
  const store = new LibraryRangeStore(async (request) => ({
    ...page(request, [card(`${generation}-${request.offset}`)], 128),
    generationId: generation,
  }));
  const randomQuery = query({ sort: "random:desc", seed: "stable-seed" });
  const key = store.ensure(randomQuery);

  store.demand(key, 0, 127, 0, 63);
  await flush();
  await flush();
  expect(store.getSnapshot(key).items.get(64)?.ratingKey).toBe("generation-a-64");

  store.release(key);
  generation = "generation-b";
  store.ensure(randomQuery);
  store.demand(key, 0, 63);
  await flush();

  const snapshot = store.getSnapshot(key);
  expect(snapshot.items.get(0)?.ratingKey).toBe("generation-b-0");
  expect(snapshot.items.has(64)).toBe(false);
});

it("requests a fresh random catalog after reactivating a cached query", async () => {
  const requests: LibraryPageRequest[] = [];
  const store = new LibraryRangeStore(async (request) => {
    requests.push(request);
    return {
      ...page(request, [card(String(requests.length))], 1),
      generationId: "same-generation",
    };
  });
  const randomQuery = query({ sort: "random:desc", seed: "stable-seed" });
  const key = store.ensure(randomQuery);
  store.demand(key, 0, 0);
  await flush();
  store.release(key);

  store.ensure(randomQuery);
  store.demand(key, 0, 0);
  await flush();

  expect(requests).toHaveLength(2);
  expect(requests.every((request) => request.refresh)).toBe(true);
});

it("does not fan out retries when the random catalog refresh fails", async () => {
  let requests = 0;
  const store = new LibraryRangeStore(async (request) => {
    requests += 1;
    if (requests === 1) throw new Error("Catalog refresh failed");
    return {
      ...page(request, [card(String(request.offset))], 128),
      generationId: "generation-a",
    };
  }, 2);
  const key = store.ensure(query({ sort: "random:desc", seed: "stable-seed" }));
  store.demand(key, 0, 127, 0, 63);
  await flush();
  await flush();

  expect(requests).toBe(1);
  expect(store.getSnapshot(key).ranges.get(0)).toBe("error");
  expect(store.getSnapshot(key).ranges.get(64)).toBe("error");

  store.retry(key, 0);
  await flush();
  await flush();
  expect(requests).toBe(3);
  expect(store.getSnapshot(key).ranges.get(0)).toBe("loaded");
  expect(store.getSnapshot(key).ranges.get(64)).toBe("loaded");
});

it("does not retry a non-retryable range failure", async () => {
  let requests = 0;
  const store = new LibraryRangeStore(async () => {
    requests += 1;
    throw new LibraryPageError("Session expired", false, 401);
  });
  const key = store.ensure(query());
  store.demand(key, 0, 63);
  await flush();

  store.retry(key, 0);
  await flush();
  expect(requests).toBe(1);
  expect(store.getSnapshot(key).errors.get(0)).toMatchObject({
    message: "Session expired",
    retryable: false,
    status: 401,
  });
});

it("ignores in-flight responses after the store is cleared", async () => {
  let resolvePage: ((value: LibraryPageDto) => void) | undefined;
  const store = new LibraryRangeStore((request) => new Promise((resolve) => {
    resolvePage = resolve;
  }));
  const key = store.ensure(query());
  store.demand(key, 0, 63);
  store.clear();
  resolvePage?.({ offset: 0, size: 1, totalSize: 1, hasMore: false, items: [card("late")] });
  await flush();

  expect(store.getSnapshot(key).items.size).toBe(0);
});
