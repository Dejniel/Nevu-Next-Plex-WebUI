/** Limit actual transport work; disconnected callers must not leave queued work behind. */
export class RequestLimiter {
    private active = 0;
    private readonly waiting: Array<{ start: () => void; priority: number }> = [];

    constructor(private readonly limit: number) {
        if (!Number.isInteger(limit) || limit < 1)
            throw new Error('Request limiter must allow at least one request');
    }

    private pump() {
        this.waiting.sort((a, b) => a.priority - b.priority);
        while (this.active < this.limit && this.waiting.length) this.waiting.shift()!.start();
    }

    run<T>(operation: () => Promise<T>, signal?: AbortSignal, priority = 0): Promise<T> {
        return new Promise((resolve, reject) => {
            const abort = () => {
                const index = this.waiting.indexOf(job);
                if (index >= 0) this.waiting.splice(index, 1);
                reject(signal?.reason ?? new DOMException('Aborted', 'AbortError'));
            };
            const start = () => {
                signal?.removeEventListener('abort', abort);
                if (signal?.aborted) return abort();
                this.active++;
                void (async () => {
                    try { resolve(await operation()); }
                    catch (error) { reject(error); }
                    finally { this.active--; this.pump(); }
                })();
            };
            const job = { start, priority };
            if (signal?.aborted) return abort();
            signal?.addEventListener('abort', abort, { once: true });
            this.waiting.push(job);
            this.pump();
        });
    }
}
