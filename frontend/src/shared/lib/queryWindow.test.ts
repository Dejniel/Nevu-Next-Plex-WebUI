import { QueryObserver, queryOptions } from "@tanstack/react-query";
import { createQueryClient } from "shared/api/queryClient";
import { queryWindowOptions } from "./queryWindow";
import { createRequestLimiter } from "./requestLimiter";

const client = createQueryClient();
const closes: (() => void)[] = [];
afterEach(async () => {
  closes.splice(0).forEach((close) => close());
  await client.cancelQueries();
  client.clear();
});

function scenario(limit = 2) {
  const prefix = ["window-test"];
  const published = 999;
  const pending = new Map<number, {
    resolve: (page: { offset: number; total: number }) => void;
    reject: (error: Error) => void;
    signal: AbortSignal;
  }>();
  const run = createRequestLimiter(limit);
  const read = vi.fn((offset: number, signal: AbortSignal) => {
    if (!offset) return Promise.resolve({ offset, total: 20_000 });
    return new Promise<{ offset: number; total: number }>((resolve, reject) => {
      pending.set(offset, { resolve, reject, signal });
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    });
  });
  const options = (revision: number, offset: number) => queryOptions({
    queryKey: [...prefix, "page", revision, offset, 64] as const,
    queryFn: ({ signal }) => run(signal, 0, () => read(offset, signal)),
    staleTime: Infinity,
  });
  const observe = (offset: number) => {
    const close = new QueryObserver(client, {
      ...options(published, offset), initialData: { offset, total: 20_000 },
    }).subscribe(() => {});
    closes.push(close);
    return close;
  };
  const validate = vi.fn();
  const window = queryWindowOptions(client, prefix, options, (page) => page.total, validate);
  client.setQueryData(window.queryKey, { revision: published });
  const refresh = () => client.fetchQuery({ ...window, staleTime: 0 });
  const finish = (offset: number) => pending.get(offset)!.resolve({ offset, total: 20_000 });
  return { observe, read, pending, refresh, finish, window, validate };
}

it("cancels an obsolete replacement immediately and publishes the new range despite its late error", async () => {
  const state = scenario();
  const leave = state.observe(64);
  const refresh = state.refresh();
  await vi.waitFor(() => expect(state.pending.has(64)).toBe(true));
  leave();
  state.observe(9984);
  await vi.waitFor(() => expect(state.pending.has(9984)).toBe(true));
  expect(state.pending.get(64)!.signal.aborted).toBe(true);
  state.pending.get(64)!.reject(new Error("Obsolete failure"));
  expect(client.getQueryData(state.window.queryKey)).toEqual({ revision: 999 });
  state.finish(9984);
  await expect(refresh).resolves.not.toEqual({ revision: 999 });
  expect(state.validate).toHaveBeenCalledWith([{ offset: 0, total: 20_000 }, { offset: 9984, total: 20_000 }]);
});

it("keeps a replacement needed by another observer and includes both current ranges", async () => {
  const state = scenario();
  const leave = state.observe(64);
  state.observe(64);
  const refresh = state.refresh();
  await vi.waitFor(() => expect(state.pending.has(64)).toBe(true));
  leave();
  state.observe(9984);
  await vi.waitFor(() => expect(state.pending.has(9984)).toBe(true));
  expect(state.pending.get(64)!.signal.aborted).toBe(false);
  state.finish(9984);
  expect(client.getQueryData(state.window.queryKey)).toEqual({ revision: 999 });
  state.finish(64);
  await refresh;
  expect(state.read.mock.calls.map(([offset]) => offset)).toEqual([0, 64, 9984]);
  expect(state.validate.mock.calls[0][0].map((page: { offset: number }) => page.offset)).toEqual([0, 64, 9984]);
});

it("removes obsolete queued replacements before they reach the transport", async () => {
  const state = scenario(1);
  state.observe(64);
  const leave = state.observe(128);
  const refresh = state.refresh();
  await vi.waitFor(() => expect(state.pending.has(64)).toBe(true));
  leave();
  state.observe(9984);
  await vi.waitFor(() => expect(client.getQueryCache().findAll().some((query) =>
    query.queryKey.at(-2) === 9984 && query.state.fetchStatus === "fetching",
  )).toBe(true));
  state.finish(64);
  await vi.waitFor(() => expect(state.pending.has(9984)).toBe(true));
  state.finish(9984);
  await refresh;
  expect(state.read.mock.calls.map(([offset]) => offset)).toEqual([0, 64, 9984]);
});

it("retains the published revision when a currently required replacement fails", async () => {
  const state = scenario();
  state.observe(64);
  const failure = state.refresh().catch((error: unknown) => error);
  await vi.waitFor(() => expect(state.pending.has(64)).toBe(true));
  state.pending.get(64)!.reject(new Error("Required failure"));
  expect(await failure).toMatchObject({ message: "Required failure" });
  expect(client.getQueryData(state.window.queryKey)).toEqual({ revision: 999 });
  expect(state.validate).not.toHaveBeenCalled();
});

it("cancels pending replacement reads when the window is cancelled", async () => {
  const state = scenario();
  state.observe(64);
  const refresh = state.refresh().catch((error: unknown) => error);
  await vi.waitFor(() => expect(state.pending.has(64)).toBe(true));
  await client.cancelQueries({ queryKey: state.window.queryKey, exact: true });
  await refresh;
  expect(state.pending.get(64)!.signal.aborted).toBe(true);
  expect(client.getQueryData(state.window.queryKey)).toEqual({ revision: 999 });
});
