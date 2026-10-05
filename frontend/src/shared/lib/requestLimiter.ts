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
          void operation()
            .then(resolve, reject)
            .finally(() => {
              active--;
              pump();
            });
        },
      };
      if (signal.aborted) return abort();
      signal.addEventListener("abort", abort, { once: true });
      waiting.push(job);
      pump();
    });
  };
}
