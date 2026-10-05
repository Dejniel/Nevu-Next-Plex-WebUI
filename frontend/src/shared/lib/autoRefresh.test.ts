import { RefreshScheduler, type RefreshSubscription } from "./autoRefresh";

let scheduler: RefreshScheduler;
let visible: DocumentVisibilityState;
let subscriptions: RefreshSubscription[];
const subscribe = (callback: () => void | Promise<void>) => {
  const subscription = scheduler.subscribe(callback);
  subscriptions.push(subscription);
  return subscription;
};
const advance = async (time: number) => {
  jest.advanceTimersByTime(time);
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};
beforeEach(() => {
  jest.useFakeTimers();
  scheduler = new RefreshScheduler();
  visible = "visible";
  subscriptions = [];
  jest
    .spyOn(document, "visibilityState", "get")
    .mockImplementation(() => visible);
});
afterEach(() => {
  subscriptions.forEach((subscription) => subscription.dispose());
  jest.restoreAllMocks();
  jest.useRealTimers();
});

it("coalesces event bursts and disposes the shared browser listeners and clock", async () => {
  const refresh = jest.fn();
  const subscription = subscribe(refresh);
  const another = subscribe(jest.fn());
  expect(jest.getTimerCount()).toBe(1);
  for (let i = 0; i < 20; i++) subscription.invalidate();
  await advance(499);
  expect(refresh).not.toHaveBeenCalled();
  await advance(1);
  expect(refresh).toHaveBeenCalledTimes(1);
  subscription.invalidate();
  subscription.dispose();
  another.dispose();
  await advance(120_000);
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(0);
});

it("retains hidden invalidations and revalidates once when the tab becomes visible", async () => {
  const refresh = jest.fn();
  const subscription = subscribe(refresh);
  visible = "hidden";
  subscription.invalidate();
  await advance(120_000);
  expect(refresh).not.toHaveBeenCalled();
  visible = "visible";
  document.dispatchEvent(new Event("visibilitychange"));
  window.dispatchEvent(new Event("focus"));
  await advance(500);
  expect(refresh).toHaveBeenCalledTimes(1);
});

it("does not refresh fresh data on focus but checks stale data and network recovery", async () => {
  const refresh = jest.fn();
  subscribe(refresh);
  window.dispatchEvent(new Event("focus"));
  await advance(500);
  expect(refresh).not.toHaveBeenCalled();
  await advance(30_000);
  window.dispatchEvent(new Event("focus"));
  window.dispatchEvent(new Event("focus"));
  await advance(500);
  expect(refresh).toHaveBeenCalledTimes(1);
  window.dispatchEvent(new Event("online"));
  await advance(500);
  expect(refresh).toHaveBeenCalledTimes(2);
});

it("shares pending refreshes and runs one follow-up for mutations received during a request", async () => {
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const refresh = jest.fn().mockReturnValueOnce(pending);
  const subscription = subscribe(refresh);
  const first = subscription.refresh();
  expect(subscription.refresh()).toBe(first);
  await advance(0);
  subscription.invalidate();
  subscription.invalidate();
  await advance(5_000);
  expect(refresh).toHaveBeenCalledTimes(1);
  finish();
  await first;
  await advance(500);
  expect(refresh).toHaveBeenCalledTimes(2);
});

it("retries failures on the normal interval without an immediate retry loop", async () => {
  const refresh = jest.fn().mockRejectedValue(new Error("offline"));
  const subscription = subscribe(refresh);
  await subscription.refresh();
  await advance(59_999);
  expect(refresh).toHaveBeenCalledTimes(1);
  await advance(501);
  expect(refresh).toHaveBeenCalledTimes(2);
});

it("does not start a queued callback after its resource is disposed", async () => {
  const refresh = jest.fn();
  const subscription = subscribe(refresh);
  const pending = subscription.refresh();
  subscription.dispose();
  await pending;
  expect(refresh).not.toHaveBeenCalled();
});
