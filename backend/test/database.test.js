import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createDatabase } from '../dist/database.js';
import { resolveDatabaseUrl } from '../dist/databaseConfig.js';
import { createReviewsRouter } from '../dist/reviews.js';
import { createUserOptionsRouter } from '../dist/userOptions.js';
import { httpErrorHandler } from '../dist/httpErrors.js';

const backendDirectory = fileURLToPath(new URL('../', import.meta.url));
const legacySchema = readFileSync(new URL('./fixtures/prisma6.sql', import.meta.url), 'utf8');
const timestamp = new Date('2026-01-01T12:34:56.789Z');

async function database(t, legacy = false) {
  const directory = mkdtempSync(resolve(tmpdir(), 'nevu-database-'));
  let prisma;
  t.after(async () => {
    await prisma?.$disconnect();
    rmSync(directory, { recursive: true, force: true });
  });
  const filename = resolve(directory, 'existing database.db');
  if (legacy) {
    const sqlite = new DatabaseSync(filename);
    sqlite.exec(legacySchema);
    sqlite.prepare('INSERT INTO UserOption VALUES (?, ?, ?)').run('profile-1', 'layout', 'grid');
    sqlite.prepare('INSERT INTO NevuReviewsLocalUsers VALUES (?, ?, ?, ?)')
      .run('profile-1', timestamp.valueOf(), 'Old name', 'old-avatar');
    sqlite.prepare('INSERT INTO NevuReviewsLocal VALUES (?, ?, ?, ?, ?, ?)')
      .run('plex://movie/old', 'profile-1', timestamp.valueOf(), 8, 'Old review', 1);
    sqlite.close();
  }
  const url = `file:${filename}`;
  // A different working directory verifies that CLI and runtime resolve the same file.
  execFileSync(process.execPath, [
    resolve(backendDirectory, 'node_modules/prisma/build/index.js'), 'db', 'push',
    '--config', resolve(backendDirectory, 'prisma7.config.ts'),
  ], { cwd: directory, env: { ...process.env, DATABASE_URL: url }, stdio: 'pipe' });
  prisma = createDatabase(url);
  await prisma.$connect();
  return { prisma, filename, url };
}

test('SQLite paths stay anchored to the backend across working directories', () => {
  assert.equal(resolveDatabaseUrl(), `file:${resolve(backendDirectory, 'data/perplexed.db')}`);
  assert.equal(resolveDatabaseUrl('file:./custom/database.db'), `file:${resolve(backendDirectory, 'custom/database.db')}`);
  assert.equal(resolveDatabaseUrl('file:/tmp/nevu.db'), 'file:/tmp/nevu.db');
  for (const value of ['file:', 'postgres://localhost/database', './data/database.db'])
    assert.throws(() => resolveDatabaseUrl(value), /local SQLite/);
});

test('Prisma 7 preserves Prisma 6 settings, timestamps and review relations', async t => {
  const { prisma, filename } = await database(t, true);
  assert.deepEqual(await prisma.userOption.findMany(), [{ userUid: 'profile-1', key: 'layout', value: 'grid' }]);
  const review = await prisma.nevuReviewsLocal.findUnique({
    where: { itemID_userID: { itemID: 'plex://movie/old', userID: 'profile-1' } }, include: { user: true },
  });
  assert.equal(review.created_at.toISOString(), timestamp.toISOString());
  assert.equal(review.user.created_at.toISOString(), timestamp.toISOString());
  assert.equal(review.spoilers, true);
  await prisma.nevuReviewsLocal.update({
    where: { itemID_userID: { itemID: review.itemID, userID: review.userID } }, data: { message: 'Updated' },
  });
  const sqlite = new DatabaseSync(filename, { readOnly: true });
  try {
    assert.equal(sqlite.prepare('SELECT created_at FROM NevuReviewsLocal').get().created_at, timestamp.valueOf());
    assert.equal(sqlite.prepare('SELECT message FROM NevuReviewsLocal').get().message, 'Updated');
  } finally { sqlite.close(); }
  await assert.rejects(prisma.nevuReviewsLocalUsers.delete({ where: { id: 'profile-1' } }));
});

test('a fresh SQLite database supports transactions, uniqueness and restart persistence', async t => {
  const { prisma, filename, url } = await database(t);
  await assert.rejects(prisma.$transaction(async transaction => {
    await transaction.nevuReviewsLocalUsers.create({ data: { id: 'rolled-back', username: 'Test', avatar: '' } });
    throw new Error('Rollback');
  }), /Rollback/);
  assert.equal(await prisma.nevuReviewsLocalUsers.count(), 0);
  await prisma.nevuReviewsLocalUsers.create({ data: { id: 'profile-1', username: 'Test', avatar: '' } });
  await prisma.nevuReviewsLocal.create({ data: { itemID: 'plex://movie/new', userID: 'profile-1', rating: 7, created_at: timestamp } });
  await assert.rejects(prisma.nevuReviewsLocal.create({ data: { itemID: 'plex://movie/new', userID: 'profile-1', rating: 9 } }));
  await prisma.$disconnect();
  const reopened = createDatabase(url);
  try {
    const review = await reopened.nevuReviewsLocal.findFirst({ include: { user: true } });
    assert.equal(review.rating, 7);
    assert.equal(review.spoilers, false);
    assert.equal(review.created_at.toISOString(), timestamp.toISOString());
    const sqlite = new DatabaseSync(filename, { readOnly: true });
    try { assert.equal(sqlite.prepare('SELECT typeof(created_at) AS type FROM NevuReviewsLocal').get().type, 'integer'); }
    finally { sqlite.close(); }
  } finally { await reopened.$disconnect(); }
});

test('options and local reviews use real SQLite and keep writes scoped to the active profile', async t => {
  const { prisma } = await database(t, true);
  const checkPlexUser = async token => ({ uuid: token, username: token, friendlyName: 'New name', thumb: '' });
  const app = express();
  app.use(express.json());
  app.use('/user/options', createUserOptionsRouter({ prisma, checkPlexUser }));
  app.use('/reviews', createReviewsRouter({ prisma, checkPlexUser, globalReviewsEnabled: false }));
  app.use(httpErrorHandler);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const headers = { 'X-Plex-Token': 'profile-2', 'Content-Type': 'application/json' };
  const option = await fetch(origin + '/user/options', { method: 'POST', headers, body: JSON.stringify({ key: 'layout', value: 'list' }) });
  assert.equal(option.status, 200);
  assert.equal((await prisma.userOption.findUnique({ where: { userUid_key: { userUid: 'profile-1', key: 'layout' } } })).value, 'grid');
  const response = await fetch(origin + '/reviews', {
    method: 'POST', headers,
    body: JSON.stringify({ itemID: 'plex://movie/old', visibility: 'LOCAL', rating: 9, message: '', spoilers: false }),
  });
  assert.equal(response.status, 200);
  const list = await (await fetch(origin + '/reviews?itemID=plex%3A%2F%2Fmovie%2Fold', { headers })).json();
  assert.equal(list.length, 2);
  assert.equal(list[0].user.id, 'profile-2');
  assert.equal(list[1].created_at, timestamp.toISOString());
  assert.equal(list[0].user.username, 'New name');
  const deleted = await fetch(origin + '/reviews?itemID=plex%3A%2F%2Fmovie%2Fold&visibility=LOCAL', { method: 'DELETE', headers });
  assert.equal(deleted.status, 200);
  assert.equal(await prisma.nevuReviewsLocal.count({ where: { userID: 'profile-1' } }), 1);
  assert.equal(await prisma.nevuReviewsLocal.count({ where: { userID: 'profile-2' } }), 0);
});
