import type express from 'express';

/** A finite response owns its deadline, including time spent waiting for transport. */
export function createRequestScope(req: express.Request, res: express.Response, timeoutMs = 0) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    req.once('aborted', abort);
    res.once('close', abort);
    if (req.aborted || res.destroyed) abort();
    const timer = timeoutMs > 0 ? setTimeout(() => controller.abort(
        new DOMException('Plex took too long to respond. Please try again.', 'TimeoutError'),
    ), timeoutMs) : undefined;
    timer?.unref();
    return {
        signal: controller.signal,
        dispose() {
            clearTimeout(timer);
            req.off('aborted', abort);
            res.off('close', abort);
        },
    };
}
