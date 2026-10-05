import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import https from 'node:https';
import zlib from 'node:zlib';
import express from 'express';
import { createPlexProxyRouter } from '../dist/plexProxy.js';
import { httpErrorHandler } from '../dist/httpErrors.js';

async function listen(t, handler) {
  const server = http.createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    server.closeAllConnections();
    if (server.listening) await new Promise(resolve => server.close(resolve));
  });
  return { server, url: `http://127.0.0.1:${server.address().port}` };
}

async function setup(t, handler) {
  const upstream = await listen(t, handler);
  const agents = {
    httpAgent: new http.Agent({ keepAlive: true, maxSockets: 1 }),
    httpsAgent: new https.Agent({ keepAlive: true }),
    eventAgent: new http.Agent(),
  };
  t.after(() => Object.values(agents).forEach(agent => agent.destroy()));
  const app = express();
  app.use(createPlexProxyRouter({ plexServer: upstream.url, ...agents }));
  app.use(httpErrorHandler);
  const frontend = await listen(t, app);
  return { upstream, url: frontend.url };
}

const post = (url, body) => fetch(url + '/proxy', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

function rawRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const request = http.request(url, options, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('error', reject);
      response.on('end', () => resolve({
        status: response.statusCode,
        headers: response.headers,
        body: Buffer.concat(chunks),
      }));
    });
    request.on('error', reject);
    request.end();
  });
}

test('dynamic proxy preserves encoded paths, embedded prefixes and repeated query keys', async t => {
  let received;
  const { url, upstream } = await setup(t, (req, res) => {
    received = { url: req.url, method: req.method, headers: req.headers };
    res.end('ok');
  });
  const path = '/library/dynproxy/My%20Sample?genre=1&genre=2&X-Plex-Token=fixture';
  const response = await rawRequest(url + '/dynproxy' + path, {
    headers: { Cookie: 'private=fixture', Connection: 'keep-alive, X-Hop', 'X-Hop': 'omit', Range: 'bytes=0-4' },
  });
  assert.equal(response.status, 200);
  assert.equal(received.url, path);
  assert.equal(received.headers.host, new URL(upstream.url).host);
  assert.equal(received.headers.range, 'bytes=0-4');
  assert.equal(received.headers.cookie, undefined);
  assert.equal(received.headers['x-hop'], undefined);
});

test('dynamic proxy streams JSON request bodies without consuming them in a parser', async t => {
  let received;
  const { url } = await setup(t, async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    received = { method: req.method, body: Buffer.concat(chunks).toString() };
    res.end('saved');
  });
  const body = '{"title":"sample", "preserve":"spacing"}';
  const response = await fetch(url + '/dynproxy/library/metadata/3', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body,
  });
  assert.equal(await response.text(), 'saved');
  assert.deepEqual(received, { method: 'PUT', body });
});

test('both streaming routes preserve Range status, download headers and exact bytes', async t => {
  const { url } = await setup(t, (req, res) => {
    assert.equal(req.headers.range, 'bytes=4-7');
    res.writeHead(206, {
      'Content-Type': 'video/mp4', 'Content-Length': 4,
      'Content-Range': 'bytes 4-7/16', 'Accept-Ranges': 'bytes',
      'Content-Disposition': 'attachment; filename="sample.mp4"',
    });
    res.end('4567');
  });
  for (const path of ['/dynproxy/file.mp4', '/proxy?url=%2Ffile.mp4&method=GET']) {
    const response = await fetch(url + path, { headers: { Range: 'bytes=4-7' } });
    assert.equal(response.status, 206);
    assert.equal(response.headers.get('content-range'), 'bytes 4-7/16');
    assert.equal(response.headers.get('content-length'), '4');
    assert.equal(response.headers.get('accept-ranges'), 'bytes');
    assert.equal(response.headers.get('content-disposition'), 'attachment; filename="sample.mp4"');
    assert.equal(await response.text(), '4567');
  }
});

test('dynamic HEAD returns media headers without a response body', async t => {
  const { url } = await setup(t, (req, res) => {
    assert.equal(req.method, 'HEAD');
    res.writeHead(200, { 'Content-Length': 16, 'Content-Type': 'video/mp4' });
    res.end();
  });
  const response = await fetch(url + '/dynproxy/file.mp4', { method: 'HEAD' });
  assert.equal(response.headers.get('content-length'), '16');
  assert.equal((await response.arrayBuffer()).byteLength, 0);
});

test('stream redirects preserve Range headers and return the final media response', async t => {
  const { url } = await setup(t, (req, res) => {
    if (req.url === '/redirect') {
      res.writeHead(302, { Location: '/file.mp4' });
      return res.end();
    }
    assert.equal(req.url, '/file.mp4');
    assert.equal(req.headers.range, 'bytes=0-3');
    res.writeHead(206, { 'Content-Range': 'bytes 0-3/4', 'Content-Length': 4 });
    res.end('file');
  });
  const response = await fetch(url + '/dynproxy/redirect', { headers: { Range: 'bytes=0-3' } });
  assert.equal(response.status, 206);
  assert.equal(await response.text(), 'file');
});

test('flat GET proxy queries retain duplicate values and the URL existing query', async t => {
  let received;
  const { url } = await setup(t, (req, res) => { received = req.url; res.end('ok'); });
  const query = new URLSearchParams({ url: '/library/all?sort=title', method: 'GET' });
  query.append('genre', '1');
  query.append('genre', '2');
  query.append('tag[key]', 'quoted ? value');
  const response = await fetch(url + '/proxy?' + query);
  assert.equal(await response.text(), 'ok');
  const target = new URL(received, 'http://localhost');
  assert.deepEqual(target.searchParams.getAll('genre'), ['1', '2']);
  assert.equal(target.searchParams.get('sort'), 'title');
  assert.equal(target.searchParams.get('tag[key]'), 'quoted ? value');
  assert.equal(target.searchParams.has('url'), false);
  assert.equal(target.searchParams.has('method'), false);
});

test('compressed streams retain their encoding and original content length', async t => {
  const compressed = zlib.gzipSync('{"sample":"metadata"}');
  const { url } = await setup(t, (_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip', 'Content-Length': compressed.length });
    res.end(compressed);
  });
  for (const path of ['/dynproxy/metadata', '/proxy?url=%2Fmetadata&method=GET']) {
    const response = await rawRequest(url + path);
    assert.equal(response.headers['content-encoding'], 'gzip');
    assert.equal(Number(response.headers['content-length']), compressed.length);
    assert.deepEqual(response.body, compressed);
  }
  const response = await post(url, { url: '/metadata', method: 'GET' });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { sample: 'metadata' });
});

test('proxy responses retain upstream failures instead of changing them to 200 or serializing a stream', async t => {
  const { url } = await setup(t, (_req, res) => {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end('{"error":"Forbidden"}');
  });
  for (const response of [
    await post(url, { url: '/metadata', method: 'GET' }),
    await fetch(url + '/proxy?url=%2Fmetadata&method=GET'),
    await fetch(url + '/dynproxy/metadata'),
  ]) {
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: 'Forbidden' });
  }
});

test('metadata proxy preserves JSON scalars and original response bytes', async t => {
  const bodies = ['123', 'true', '"string"', '{ "title": "sample" }'];
  let index = 0;
  const { url } = await setup(t, (_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(bodies[index++]);
  });
  for (const body of bodies) {
    const response = await post(url, { url: '/metadata', method: 'GET' });
    assert.equal(response.status, 200);
    assert.equal(await response.text(), body);
  }
});

test('invalid POST bodies and ambiguous GET parameters fail before contacting Plex', async t => {
  let requests = 0;
  const { url } = await setup(t, (_req, res) => { requests++; res.end(); });
  for (const body of [undefined, {}, { url: 7, method: 'GET' }, { url: '/metadata', method: 7 }, { url: '/metadata', method: 'GET', headers: 'bad' }]) {
    assert.equal((await post(url, body)).status, 400);
  }
  const response = await fetch(url + '/proxy?url=/one&url=/two&method=GET');
  assert.equal(response.status, 400);
  const malformed = await fetch(url + '/proxy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"token":"fixture"' });
  assert.equal(malformed.status, 400);
  assert.deepEqual(await malformed.json(), { error: 'Invalid request' });
  assert.equal(requests, 0);
});

test('connection errors produce a bounded gateway failure on both transports', async t => {
  const { url, upstream } = await setup(t, (_req, res) => res.end());
  await new Promise(resolve => upstream.server.close(resolve));
  for (const response of [
    await post(url, { url: '/metadata', method: 'GET' }),
    await fetch(url + '/dynproxy/file.mp4'),
  ]) {
    assert.equal(response.status, 502);
    assert.equal(await response.text(), 'Plex proxy request failed');
  }
});

test('SSE uses a separate connection pool and cancels its upstream on disconnect', { timeout: 5000 }, async t => {
  let closed;
  const upstreamClosed = new Promise(resolve => { closed = resolve; });
  const { url } = await setup(t, (req, res) => {
    if (req.url !== '/:/eventsource/notifications') return res.end('metadata');
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.write('event: message\ndata: {"type":"library"}\n\n');
    res.on('close', closed);
  });
  const controller = new AbortController();
  const response = await fetch(url + '/dynproxy/:/eventsource/notifications', { signal: controller.signal });
  const reader = response.body.getReader();
  assert.match(new TextDecoder().decode((await reader.read()).value), /event: message/);
  const metadata = await post(url, { url: '/metadata', method: 'GET' });
  assert.equal(await metadata.text(), 'metadata');
  controller.abort();
  await upstreamClosed;
});

test('truncated upstream streams close the response rather than appending an error body', async t => {
  const { url } = await setup(t, (_req, res) => {
    res.writeHead(200, { 'Content-Length': 1000 });
    res.write('part');
    setTimeout(() => res.destroy(), 20);
  });
  const response = await fetch(url + '/dynproxy/file.mp4');
  assert.equal(response.status, 200);
  await assert.rejects(response.text());
});
