import { createQueryClient } from "shared/api/queryClient";
import { getPagedCollection } from "./PagedCollection";
import { RequestQueue } from "./RequestQueue";

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const page = (item: string) => ({ offset: 0, total: 1, items: [item] });

it("shares a collection between consumers and cancels only after the last release", async () => {
  const client = createQueryClient();
  const pending = deferred<ReturnType<typeof page>>();
  let signal!: AbortSignal;
  const fetch = vi.fn((_offset: number, current: AbortSignal) => {
    signal = current;
    return pending.promise;
  });
  const options = { pageSize: 64, page: fetch, loadFirst: true };
  const first = getPagedCollection(["list", "profile"], options, client);
  const second = getPagedCollection(["list", "profile"], options, client);
  first.retain();
  second.retain();
  first.demand(0, 0);
  second.demand(0, 0);
  expect(fetch).toHaveBeenCalledTimes(1);
  first.release();
  expect(signal.aborted).toBe(false);
  second.release();
  expect(signal.aborted).toBe(true);
  pending.resolve(page("late"));
  await flush();
  expect(second.snapshot().items.size).toBe(0);
  client.clear();
});

it("does not let a removed resource overwrite or cancel a new resource with the same key", async () => {
  const client = createQueryClient();
  const oldRequest = deferred<ReturnType<typeof page>>();
  const newRequest = deferred<ReturnType<typeof page>>();
  let currentSignal!: AbortSignal;
  const old = getPagedCollection(
    ["list", "profile"],
    { pageSize: 64, page: () => oldRequest.promise, loadFirst: true },
    client,
  );
  old.retain();
  client.clear();
  const current = getPagedCollection(
    ["list", "profile"],
    {
      pageSize: 64,
      loadFirst: true,
      page: (_offset, signal) => {
        currentSignal = signal;
        return newRequest.promise;
      },
    },
    client,
  );
  current.retain();
  old.release();
  expect(currentSignal.aborted).toBe(false);
  oldRequest.resolve(page("old"));
  newRequest.resolve(page("current"));
  await flush();
  expect([...current.snapshot().items.values()]).toEqual(["current"]);
  expect(old.snapshot().items.size).toBe(0);
  current.release();
  client.clear();
});

it("keeps cached data on re-entry and lets Query collect inactive resources", async () => {
  const client = createQueryClient();
  const fetch = vi.fn(async () => page("cached"));
  const options = { pageSize: 64, page: fetch, loadFirst: true };
  const collection = getPagedCollection(["list", "profile"], options, client);
  collection.retain();
  await flush();
  collection.release();
  const same = getPagedCollection(["list", "profile"], options, client);
  expect(same).toBe(collection);
  expect([...same.snapshot().items.values()]).toEqual(["cached"]);
  vi.useFakeTimers();
  same.retain();
  await same.refresh();
  same.release();
  await vi.advanceTimersByTimeAsync(300_001);
  expect(client.getQueryData(["list", "profile"])).toBeUndefined();
  expect(getPagedCollection(["list", "profile"], options, client)).not.toBe(
    collection,
  );
  client.clear();
  vi.useRealTimers();
});

it("does not strand a random catalog when its queued first range leaves the viewport", async () => {
  const client = createQueryClient();
  const queue = new RequestQueue(1);
  const blocker = deferred<ReturnType<typeof page>>();
  const first = getPagedCollection(
    ["busy"],
    { pageSize: 64, page: () => blocker.promise, queue },
    client,
  );
  first.retain();
  first.demand(0, 0);
  const fetch = vi.fn(async (offset: number) => ({
    offset,
    total: 500,
    items: [String(offset)],
    generationId: "catalog",
  }));
  const random = getPagedCollection(
    ["random"],
    { pageSize: 64, page: fetch, refreshCatalog: true, queue },
    client,
  );
  random.retain();
  random.demand(0, 0);
  random.demand(192, 255);
  blocker.resolve(page("done"));
  await flush();
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenCalledWith(192, expect.any(AbortSignal), true);
  expect(random.snapshot().items.get(192)).toBe("192");
  first.release();
  random.release();
  client.clear();
});

it("requeues an old in-flight range under the new catalog generation", async () => {
  const client = createQueryClient();
  const old = deferred<{
    offset: number;
    total: number;
    items: string[];
    generationId: string;
  }>();
  let generation = "a";
  let hold = true;
  const fetch = vi.fn(async (offset: number) => {
    if (offset === 64 && hold) return old.promise;
    return {
      offset,
      total: 500,
      items: [generation + offset],
      generationId: generation,
    };
  });
  const collection = getPagedCollection(
    ["list"],
    { pageSize: 64, page: fetch },
    client,
  );
  collection.retain();
  collection.demand(0, 0);
  await flush();
  collection.demand(64, 127);
  generation = "b";
  collection.demand(64, 191);
  await flush();
  hold = false;
  old.resolve({ offset: 64, total: 500, items: ["old"], generationId: "a" });
  await flush();
  expect(collection.snapshot().items.get(64)).toBe("b64");
  expect(collection.snapshot().items.get(128)).toBe("b128");
  expect(collection.snapshot().items.has(0)).toBe(false);
  collection.release();
  client.clear();
});
