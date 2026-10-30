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
