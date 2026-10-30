import { createRequestLimiter, runPageRequest } from "./requestLimiter";

it("bounds concurrency, prioritizes visible work and drops an aborted queued request", async () => {
  const run = createRequestLimiter(1);
  const controller = new AbortController();
  const obsolete = new AbortController();
  let release!: () => void;
  const order: string[] = [];
  const first = run(
    controller.signal,
    0,
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  const overscan = run(controller.signal, 2, async () => {
    order.push("overscan");
  });
  const cancelled = run(obsolete.signal, 0, async () => {
    order.push("obsolete");
  });
  const rejected = cancelled.catch((error: unknown) => error);
  const visible = run(controller.signal, 0, async () => {
    order.push("visible");
  });
  obsolete.abort();
  expect(order).toEqual([]);
  release();
  await Promise.all([first, overscan, visible, rejected]);
  expect(await rejected).toMatchObject({ name: "AbortError" });
  expect(order).toEqual(["visible", "overscan"]);
});

it("releases a slot after a synchronous transport failure", async () => {
  const run = createRequestLimiter(1);
  const signal = new AbortController().signal;
  await expect(run(signal, 0, () => { throw new Error("Transport failed"); })).rejects.toThrow("Transport failed");
  await expect(run(signal, 0, async () => "recovered")).resolves.toBe("recovered");
});

const hanging = (signal: AbortSignal) => new Promise<never>((_, reject) => {
  signal.addEventListener("abort", () => reject(signal.reason), { once: true });
});

const temporaryFailure = () => Object.assign(new Error("Temporarily unavailable"), { status: 503 });

it("retries once after backoff, cancelling sibling reads and freeing its slot in between", async () => {
  vi.useFakeTimers();
  const other = new AbortController();
  const parent = new AbortController();
  const signals: AbortSignal[] = [];
  try {
    const read = vi.fn(async (signal: AbortSignal) => {
      signals.push(signal);
      if (signals.length === 1) await Promise.all([Promise.reject(temporaryFailure()), hanging(signal)]);
      return "recovered";
    });
    const result = runPageRequest(parent.signal, 0, read);
    const busy = runPageRequest(other.signal, 0, hanging).catch(error => error);
    await vi.advanceTimersByTimeAsync(0);
    expect(signals[0].aborted).toBe(true);
    await expect(runPageRequest(parent.signal, 0, async () => "visible page")).resolves.toBe("visible page");
    await vi.advanceTimersByTimeAsync(499);
    expect(read).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toBe("recovered");
    expect(read).toHaveBeenCalledTimes(2);
    expect(signals[1]).not.toBe(signals[0]);
    expect(parent.signal.aborted).toBe(false);
    other.abort();
    await busy;
  } finally { other.abort(); parent.abort(); vi.useRealTimers(); }
});

it("cancels backoff when the last page consumer leaves", async () => {
  vi.useFakeTimers();
  const controller = new AbortController();
  try {
    const read = vi.fn(async () => { throw temporaryFailure(); });
    const result = runPageRequest(controller.signal, 0, read).catch(error => error);
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    expect(await result).toMatchObject({ name: "AbortError" });
    await vi.advanceTimersByTimeAsync(500);
    expect(read).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  } finally { controller.abort(); vi.useRealTimers(); }
});

it("keeps both attempts inside the original deadline", async () => {
  vi.useFakeTimers();
  const controller = new AbortController();
  let retrySignal: AbortSignal | undefined;
  try {
    const read = vi.fn(async (signal: AbortSignal) => {
      if (read.mock.calls.length === 1) throw temporaryFailure();
      retrySignal = signal;
      return hanging(signal);
    });
    const result = runPageRequest(controller.signal, 0, read, 800).catch(error => error);
    await vi.advanceTimersByTimeAsync(500);
    expect(read).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(300);
    expect(await result).toMatchObject({ retryable: true, message: expect.stringContaining("too long") });
    expect(retrySignal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  } finally { controller.abort(); vi.useRealTimers(); }
});

it("stops after one automatic retry and still permits an explicit retry", async () => {
  vi.useFakeTimers();
  const controller = new AbortController();
  try {
    const failure = temporaryFailure();
    const read = vi.fn(async () => { throw failure; });
    const result = runPageRequest(controller.signal, 0, read).catch(error => error);
    await vi.advanceTimersByTimeAsync(500);
    expect(await result).toBe(failure);
    expect(read).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
    await expect(runPageRequest(controller.signal, 0, async () => "manual recovery")).resolves.toBe("manual recovery");
  } finally { controller.abort(); vi.useRealTimers(); }
});

it("times out a running page, aborts its transport and allows a queued page to start", async () => {
  vi.useFakeTimers();
  const other = new AbortController();
  try {
    const first = runPageRequest(new AbortController().signal, 0, hanging, 10).catch(error => error);
    const second = runPageRequest(other.signal, 0, hanging, 100).catch(error => error);
    const load = vi.fn(async () => "next page");
    const queued = runPageRequest(other.signal, 0, load, 100);
    expect(load).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(10);
    expect(await first).toMatchObject({ retryable: true, message: expect.stringContaining("too long") });
    await expect(queued).resolves.toBe("next page");
    other.abort();
    await second;
  } finally { other.abort(); vi.useRealTimers(); }
});

it("counts queue waiting in the deadline and removes the expired page without starting it", async () => {
  vi.useFakeTimers();
  const controller = new AbortController();
  try {
    const active = [0, 1].map(() => runPageRequest(controller.signal, 0, hanging, 100).catch(error => error));
    const load = vi.fn(async () => "obsolete");
    const queued = runPageRequest(controller.signal, 0, load, 10).catch(error => error);
    await vi.advanceTimersByTimeAsync(10);
    expect(await queued).toMatchObject({ retryable: true });
    controller.abort();
    await Promise.all(active);
    expect(load).not.toHaveBeenCalled();
    await expect(runPageRequest(new AbortController().signal, 0, async () => "recovered")).resolves.toBe("recovered");
  } finally { controller.abort(); vi.useRealTimers(); }
});
