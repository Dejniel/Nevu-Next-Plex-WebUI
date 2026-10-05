import { createRequestLimiter } from "./requestLimiter";

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
