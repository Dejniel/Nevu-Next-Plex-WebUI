import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Sqlite from 'better-sqlite3';
import express from 'express';
import { createDatabase } from '../dist/database.js';
import { resolveDatabasePath } from '../dist/databaseConfig.js';
import { createUserOptionsRouter } from '../dist/userOptions.js';
import { httpErrorHandler } from '../dist/httpErrors.js';

function temporaryFile(t) {
  const directory = mkdtempSync(resolve(tmpdir(), 'nevu-database-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return resolve(directory, 'nested', 'settings database.db');
}

const backendDirectory = fileURLToPath(new URL('../', import.meta.url));

test('SQLite paths stay anchored to the backend across working directories', () => {
  assert.equal(resolveDatabasePath(), resolve(backendDirectory, 'data/perplexed.db'));
  assert.equal(resolveDatabasePath('file:./custom/database.db'), resolve(backendDirectory, 'custom/database.db'));
  assert.equal(resolveDatabasePath('file:/tmp/nevu.db'), '/tmp/nevu.db');
  for (const value of ['file:', 'postgres://localhost/database', './data/database.db'])
    assert.throws(() => resolveDatabasePath(value), /local SQLite/);
});

test('a fresh database has one table and retains scoped settings after reopening', t => {
  const filename = temporaryFile(t);
  const database = createDatabase(filename);
  const key = "layout'; DROP TABLE UserOption; --";
  try {
    database.setOption('profile-1', key, 'grid');
    database.setOption('profile-2', key, 'list');
    database.setOption('profile-1', key, 'poster');
    assert.equal(database.getOptions('profile-1').length, 1);
    assert.equal(database.getOption('profile-2', key).value, 'list');
    assert.equal(database.getOption('profile-3', key), undefined);
  } finally { database.close(); }
  const reopened = createDatabase(filename);
  try {
    assert.deepEqual(reopened.getOptions('profile-1'), [{ userUid: 'profile-1', key, value: 'poster' }]);
    const sqlite = new Sqlite(filename, { readonly: true });
    try {
      assert.deepEqual(sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all(), [{ name: 'UserOption' }]);
      assert.equal(sqlite.pragma('journal_mode', { simple: true }), 'wal');
    } finally { sqlite.close(); }
  } finally { reopened.close(); }
});

test('opening an existing settings table preserves its data without schema migration', t => {
  const filename = temporaryFile(t);
  createDatabase(filename).close();
  const sqlite = new Sqlite(filename);
  sqlite.exec('DROP TABLE UserOption; CREATE TABLE UserOption (userUid TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY (userUid, key))');
  sqlite.prepare('INSERT INTO UserOption VALUES (?, ?, ?)').run('profile', 'layout', 'grid');
  sqlite.close();
  const database = createDatabase(filename);
  try {
    assert.equal(database.getOption('profile', 'layout').value, 'grid');
    database.setOption('profile', 'layout', 'poster');
    assert.equal(database.getOptions('profile').length, 1);
  } finally { database.close(); }
});

test('the HTTP options API uses real SQLite and ignores a forged profile in the body', async t => {
  const database = createDatabase(temporaryFile(t));
  database.setOption('profile-1', 'layout', 'grid');
  const checkPlexUser = async token => token === 'fixture' ? { uuid: 'profile-2' } : null;
  const app = express();
  app.use(express.json());
  app.use('/user/options', createUserOptionsRouter({ database, checkPlexUser }));
  app.use(httpErrorHandler);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    database.close();
  });
  const url = `http://127.0.0.1:${server.address().port}/user/options`;
  const headers = { 'X-Plex-Token': 'fixture', 'Content-Type': 'application/json' };
  const response = await fetch(url, {
    method: 'POST', headers,
    body: JSON.stringify({ key: 'layout', value: 'poster', userUid: 'profile-1' }),
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { userUid: 'profile-2', key: 'layout', value: 'poster' });
  assert.equal(database.getOption('profile-1', 'layout').value, 'grid');
  assert.deepEqual(await (await fetch(url, { headers })).json(), [{ userUid: 'profile-2', key: 'layout', value: 'poster' }]);
  assert.equal((await fetch(url + '/missing', { headers })).status, 404);
  assert.equal((await fetch(url)).status, 401);
});
