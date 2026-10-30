/** Bounds transport work only. Query owns request sharing and cancellation. */
export function createRequestLimiter(limit = 2) {
  if (!Number.isInteger(limit) || limit < 1) throw new Error("The request limit must be positive.");
  let active = 0;
  const waiting: Array<{ priority: number; start: () => void }> = [];
  function pump() {
    waiting.sort((a, b) => a.priority - b.priority);
    while (active < limit && waiting.length) waiting.shift()!.start();
  }
  return function run<T>(signal: AbortSignal, priority: number, operation: () => Promise<T>) {
    return new Promise<T>((resolve, reject) => {
      const abort = () => {
        const index = waiting.indexOf(job);
        if (index >= 0) waiting.splice(index, 1);
        reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
      };
      const job = {
        priority,
        start: () => {
          signal.removeEventListener("abort", abort);
          if (signal.aborted) return abort();
          active++;
          void (async () => {
            try { resolve(await operation()); }
            catch (error) { reject(error); }
            finally { active--; pump(); }
          })();
        },
      };
      if (signal.aborted) return abort();
      signal.addEventListener("abort", abort, { once: true });
      waiting.push(job);
      pump();
    });
  };
}

const runLimitedPage = createRequestLimiter(2);

/** Bound the complete page read, including its queue wait, without aborting other consumers. */
export async function runPageRequest<T>(
  signal: AbortSignal,
  priority: number,
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs = 30_000,
) {
  const controller = new AbortController();
  const abort = () => controller.abort(signal.reason);
  if (signal.aborted) abort();
  else signal.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => controller.abort(Object.assign(
    new Error("Loading this part of the list took too long. Please try again."),
    { retryable: true },
  )), timeoutMs);
  try {
    return await runLimitedPage(controller.signal, priority, () => operation(controller.signal));
  } catch (error) {
    if (controller.signal.aborted) throw controller.signal.reason;
    throw error;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", abort);
  }
}
