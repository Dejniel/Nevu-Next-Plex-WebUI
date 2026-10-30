import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import https from 'node:https';
import express from 'express';
import { createLibraryPageRouter } from '../dist/libraryPage.js';
import { createPlexProxyRouter } from '../dist/plexProxy.js';
import { RequestLimiter } from '../dist/common/requestLimiter.js';

const until = async predicate => {
    for (let attempt = 0; attempt < 100; attempt++) {
        if (predicate()) return;
        await new Promise(resolve => setTimeout(resolve, 5));
    }
    assert.fail('The expected transport event did not occur');
};
async function listen(t, handler) {
    const server = http.createServer(handler);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(async () => {
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
    });
    return `http://127.0.0.1:${server.address().port}`;
}
async function library(t, handler, options = {}) {
    const plexServer = await listen(t, handler);
    const arrivals = [];
    const app = express();
    app.use((req, _res, next) => { arrivals.push(req.url); next(); });
    app.use('/library-page', createLibraryPageRouter({ plexServer, maxConcurrentRequests: 1, ...options }));
    return { url: await listen(t, app), arrivals };
}
const read = (url, offset = 0, signal, extra = {}) => fetch(url + '/library-page?' + new URLSearchParams({
    sectionId: '1', sort: 'titleSort', offset: String(offset), size: '64', ...extra,
}), { signal, headers: { 'X-Plex-Token': 'synthetic-fixture' } });
const container = (res, offset = 0) => res.end(JSON.stringify({ MediaContainer: {
    offset, totalSize: offset + 1, size: 1,
    Metadata: [{ ratingKey: String(offset + 1), type: 'movie', title: 'Fixture', guid: 'local://fixture' }],
} }));

test('visible reads overtake queued background work and an expired queued read never starts', async () => {
    const limiter = new RequestLimiter(1);
    let finish;
    const first = limiter.run(() => new Promise(resolve => { finish = resolve; }));
    const order = [];
    const background = limiter.run(async () => { order.push('background'); }, undefined, 1);
    const controller = new AbortController();
    const obsolete = limiter.run(async () => { order.push('obsolete'); }, controller.signal).catch(error => error);
    const current = limiter.run(async () => { order.push('visible'); });
    controller.abort(new DOMException('Expired', 'TimeoutError'));
    assert.equal((await obsolete).name, 'TimeoutError');
    finish();
    await Promise.all([first, background, current]);
    assert.deepEqual(order, ['visible', 'background']);
});

test('disconnected running and queued library reads release capacity for the current viewport', async t => {
    const seen = [];
    let disconnected = false;
    const { url, arrivals } = await library(t, (req, res) => {
        const offset = Number(new URL(req.url, 'http://plex').searchParams.get('X-Plex-Container-Start'));
        seen.push(offset);
        if (!offset) res.on('close', () => { disconnected = true; });
        else container(res, offset);
    });
    const running = new AbortController(), queued = new AbortController();
    const first = read(url, 0, running.signal).catch(error => error);
    await until(() => seen.length === 1);
    const obsolete = read(url, 64, queued.signal).catch(error => error);
    await until(() => arrivals.length === 2);
    queued.abort();
    await obsolete;
    const current = read(url, 128);
    await until(() => arrivals.length === 3);
    running.abort();
    await first;
    assert.equal((await current).status, 200);
    await until(() => disconnected);
    assert.deepEqual(seen, [0, 128]);
});

test('a stalled page ends with a retryable timeout and the next page can load', async t => {
    let disconnected = false;
    const { url } = await library(t, (req, res) => {
        const offset = Number(new URL(req.url, 'http://plex').searchParams.get('X-Plex-Container-Start'));
        if (!offset) res.on('close', () => { disconnected = true; });
        else container(res, offset);
    }, { requestTimeoutMs: 50 });
    const response = await read(url);
    assert.equal(response.status, 504);
    assert.equal((await response.json()).retryable, true);
    await until(() => disconnected);
    assert.equal((await read(url, 64)).status, 200);
});

test('a shared random catalog survives one departure, cancels on the last and can restart', async t => {
    const pending = [], closed = new Set();
    const { url, arrivals } = await library(t, (req, res) => {
        const section = new URL(req.url, 'http://plex').pathname;
        pending.push({ section, res });
        res.on('close', () => closed.add(res));
    });
    const random = { sort: 'random', seed: 'fixture' };
    const one = new AbortController(), two = new AbortController();
    const first = read(url, 0, one.signal, random).catch(error => error);
    const second = read(url, 0, two.signal, random);
    await until(() => pending.length === 1 && arrivals.length === 2);
    one.abort();
    await first;
    assert.equal(closed.has(pending[0].res), false);
    container(pending[0].res);
    assert.equal((await second).status, 200);
    assert.equal(pending.length, 1);

    const other = { ...random, sectionId: '2' };
    const last = new AbortController();
    const cancelled = read(url, 0, last.signal, other).catch(error => error);
    await until(() => pending.length === 2);
    last.abort();
    await cancelled;
    await until(() => closed.has(pending[1].res));
    const retry = read(url, 0, undefined, other);
    await until(() => pending.length === 3);
    container(pending[2].res);
    assert.equal((await retry).status, 200);
});

async function proxy(t, handler, options = {}) {
    const plexServer = await listen(t, handler);
    const agents = {
        httpAgent: new http.Agent({ keepAlive: true, maxSockets: 1 }),
        httpsAgent: new https.Agent(), eventAgent: new http.Agent(),
        imageHttpAgent: new http.Agent({ keepAlive: true, maxSockets: 1 }),
        imageHttpsAgent: new https.Agent(),
    };
    t.after(() => Object.values(agents).forEach(agent => agent.destroy()));
    const app = express();
    app.use(createPlexProxyRouter({ plexServer, ...agents, requestTimeoutMs: 80, imageTimeoutMs: 80, ...options }));
    return listen(t, app);
}
const imagePath = '/dynproxy/photo/:/transcode?X-Plex-Token=synthetic-fixture';
const metadata = url => fetch(url + '/proxy', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: '/library/metadata/1', method: 'GET', headers: { 'X-Plex-Token': 'synthetic-fixture' } }),
});

test('stalled artwork cannot occupy the metadata pool and expires before response headers', async t => {
    let started = false, closed = false;
    const url = await proxy(t, (req, res) => {
        if (req.url.startsWith('/photo/')) {
            started = true;
            res.on('close', () => { closed = true; });
        } else res.end('metadata');
    });
    const image = fetch(url + imagePath);
    await until(() => started);
    assert.equal(await (await metadata(url)).text(), 'metadata');
    assert.equal(closed, false);
    assert.equal((await image).status, 504);
    await until(() => closed);
});

test('an incomplete image body is terminated, but video and subtitle streams remain open', async t => {
    let imageClosed = false;
    const url = await proxy(t, (req, res) => {
        if (req.url.startsWith('/photo/')) {
            res.on('close', () => { imageClosed = true; });
            res.write('incomplete image');
        } else {
            res.write('first chunk');
            const timer = setTimeout(() => res.end(' last chunk'), 140);
            res.on('close', () => clearTimeout(timer));
        }
    });
    const image = await fetch(url + imagePath);
    assert.equal(image.status, 504);
    await until(() => imageClosed);
    for (const path of ['/file.mp4', '/video/:/transcode/universal/subtitles']) {
        const response = await fetch(url + '/dynproxy' + path + '?X-Plex-Token=synthetic-fixture');
        assert.equal(await response.text(), 'first chunk last chunk');
    }
});

test('a stalled buffered metadata proxy response also has a deadline', async t => {
    let closed = false;
    const url = await proxy(t, (_req, res) => res.on('close', () => { closed = true; }));
    assert.equal((await metadata(url)).status, 504);
    await until(() => closed);
});

test('artwork retries a transient response once without holding a socket during backoff', async t => {
    let reads = 0;
    const bytes = Buffer.from([0, 255, 1, 128]);
    const url = await proxy(t, (req, res) => {
        if (req.url.includes('other')) return res.end('other image');
        reads++;
        if (reads === 1) { res.statusCode = 503; return res.end('Temporary failure'); }
        res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': bytes.length });
        res.end(bytes);
    }, { imageTimeoutMs: 1500 });
    const recovering = fetch(url + imagePath);
    await until(() => reads === 1);
    assert.equal(await (await fetch(url + imagePath + '&url=other')).text(), 'other image');
    assert.equal(reads, 1);
    const response = await recovering;
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'image/png');
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
    assert.equal(reads, 2);
});

test('a truncated artwork body can recover before any broken bytes reach the browser', async t => {
    let reads = 0;
    const url = await proxy(t, (_req, res) => {
        reads++;
        res.writeHead(200, { 'Content-Length': 8 });
        if (reads === 1) {
            res.write('broken');
            return setImmediate(() => res.destroy());
        }
        res.end('complete');
    }, { imageTimeoutMs: 1500 });
    const response = await fetch(url + imagePath);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), 'complete');
    assert.equal(reads, 2);
});

test('artwork backoff ends at the original deadline rather than starting a fresh budget', async t => {
    let reads = 0;
    const url = await proxy(t, (_req, res) => {
        reads++;
        res.statusCode = 503;
        res.end('Temporary failure');
    }, { imageTimeoutMs: 100 });
    assert.equal((await fetch(url + imagePath)).status, 504);
    assert.equal(reads, 1);
});

test('leaving artwork during backoff prevents its second attempt', async t => {
    let reads = 0;
    const url = await proxy(t, (_req, res) => {
        reads++;
        res.statusCode = 503;
        res.end('Temporary failure');
    }, { imageTimeoutMs: 1500 });
    const controller = new AbortController();
    const response = fetch(url + imagePath, { signal: controller.signal }).catch(error => error);
    await until(() => reads === 1);
    controller.abort();
    assert.equal((await response).name, 'AbortError');
    await new Promise(resolve => setTimeout(resolve, 550));
    assert.equal(reads, 1);
});

test('permanent artwork errors and writes are never retried', async t => {
    let reads = 0;
    const url = await proxy(t, (req, res) => {
        reads++;
        res.statusCode = Number(new URL(req.url, 'http://plex').searchParams.get('status'));
        res.end('Rejected');
    }, { imageTimeoutMs: 1500 });
    for (const status of [400, 401, 403, 404, 429])
        assert.equal((await fetch(url + imagePath + '&status=' + status)).status, status);
    assert.equal((await fetch(url + imagePath + '&status=503', { method: 'POST' })).status, 503);
    assert.equal(reads, 6);
});

test('a persistent artwork failure stops after its second response', async t => {
    let reads = 0;
    const url = await proxy(t, (_req, res) => {
        reads++;
        res.statusCode = 503;
        res.end('Still unavailable');
    }, { imageTimeoutMs: 1500 });
    assert.equal((await fetch(url + imagePath)).status, 503);
    assert.equal(reads, 2);
});
