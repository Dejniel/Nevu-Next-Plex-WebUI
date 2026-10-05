import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import express from 'express';
import { createUserOptionsRouter } from '../dist/userOptions.js';
import { httpErrorHandler } from '../dist/httpErrors.js';

async function setup(t, database, checkPlexUser = async () => ({ uuid: 'profile' })) {
  const app = express();
  app.use(express.json());
  app.use('/user/options', createUserOptionsRouter({ database, checkPlexUser }));
  app.use(httpErrorHandler);
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  });
  return `http://127.0.0.1:${server.address().port}/user/options`;
}

const headers = { 'X-Plex-Token': 'fixture', 'Content-Type': 'application/json' };

test('user options are scoped to the authenticated profile and preserve an encoded key', async t => {
  const queries = [];
  const url = await setup(t, {
    getOptions: userUid => { queries.push([userUid]); return [{ key: 'layout', value: 'grid' }]; },
    getOption: (userUid, key) => { queries.push([userUid, key]); return { key, value: 'grid' }; },
  });
  assert.equal((await fetch(url, { headers })).status, 200);
  assert.equal((await fetch(url + '/layout%3Amovies', { headers })).status, 200);
  assert.deepEqual(queries, [['profile'], ['profile', 'layout:movies']]);
});

test('missing and expired sessions cannot read user options', async t => {
  const url = await setup(t, { getOptions: () => assert.fail('Unauthenticated database access') }, async () => null);
  assert.equal((await fetch(url)).status, 401);
  assert.equal((await fetch(url, { headers })).status, 401);
});

test('missing options return 404 and invalid bodies fail before writes', async t => {
  const url = await setup(t, { getOption: () => undefined, setOption: () => assert.fail('Invalid database write') });
  assert.equal((await fetch(url + '/missing', { headers })).status, 404);
  for (const body of [undefined, {}, { key: 1, value: 'grid' }, { key: 'layout', value: {} }])
    assert.equal((await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) })).status, 400);
});

test('saving an option uses the active profile for the unique key and creation', async t => {
  let saved;
  const url = await setup(t, { setOption: (...input) => { saved = input; return { userUid: input[0], key: input[1], value: input[2] }; } });
  const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ key: 'layout', value: 'grid' }) });
  assert.equal(response.status, 200);
  assert.deepEqual(saved, ['profile', 'layout', 'grid']);
});

test('Express catches database failures once and returns a safe 500 response', async t => {
  const failure = () => { throw new Error('private database details'); };
  const url = await setup(t, { getOptions: failure, getOption: failure, setOption: failure });
  for (const response of [
    await fetch(url, { headers }), await fetch(url + '/layout', { headers }),
    await fetch(url, { method: 'POST', headers, body: JSON.stringify({ key: 'layout', value: 'grid' }) }),
  ]) {
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: 'Internal server error' });
  }
});

test('Express also handles a rejected async authentication middleware', async t => {
  const url = await setup(t, {}, async () => { throw new Error('private authentication details'); });
  const response = await fetch(url, { headers });
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: 'Internal server error' });
});
