import { isTransientReadError } from "shared/api/readErrors";

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

function waitForRetry(signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, 500);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
  });
}

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
    for (let attempt = 0; ; attempt++) {
      controller.signal.throwIfAborted();
      try {
        return await runLimitedPage(controller.signal, priority, async () => {
          // A page can read both contents and summary. End all siblings before retrying.
          const read = new AbortController();
          const cancel = () => read.abort(controller.signal.reason);
          controller.signal.addEventListener("abort", cancel, { once: true });
          if (controller.signal.aborted) cancel();
          try {
            return await operation(read.signal);
          } finally {
            read.abort();
            controller.signal.removeEventListener("abort", cancel);
          }
        });
      } catch (error) {
        if (attempt > 0 || controller.signal.aborted || !isTransientReadError(error)) throw error;
        // Backoff holds no transport slot and remains inside the original deadline.
        await waitForRetry(controller.signal);
      }
    }
  } catch (error) {
    if (controller.signal.aborted) throw controller.signal.reason;
    throw error;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", abort);
  }
}
