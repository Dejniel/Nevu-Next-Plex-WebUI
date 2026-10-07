import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import express from 'express';
import axios from 'axios';
import { createPlexSharingRouter } from '../dist/plexSharing.js';

async function setup(t, restricted = false) {
    const original = { get: axios.get, post: axios.post, delete: axios.delete };
    const writes = [];
    axios.get = async url => {
        if (url.endsWith('/api/v2/user')) return { data: { id: 1, restricted } };
        if (url.endsWith('/media/providers')) return { data: { Feature: [{ type: 'manage' }] } };
        if (url.endsWith('/identity')) return { data: { MediaContainer: { machineIdentifier: 'server' } } };
        if (url.endsWith('/library/sections')) return { data: { MediaContainer: { Directory: [{ key: '1', title: 'Movies', type: 'movie' }] } } };
        if (url.endsWith('/owned/accepted')) return { data: [{ id: 42, invitedId: 2, machineIdentifier: 'server', accepted: true, invited: { id: 2, title: 'Child', home: true }, libraries: [{ key: 1 }], sharingSettings: { allowSync: false, filterMovies: 'contentRating=PG', allowTuners: 1 } }] };
        if (url.endsWith('/owned/pending')) return { data: [] };
        assert.fail(`Unexpected read: ${url}`);
    };
    axios.post = async (...args) => { writes.push(args); return { data: {} }; };
    axios.delete = async (...args) => { writes.push(args); return { data: {} }; };
    const app = express();
    app.use(express.json());
    app.use('/sharing', createPlexSharingRouter({ plexServer: 'http://fixture-plex' }));
    const server = http.createServer(app);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(async () => {
        Object.assign(axios, original);
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
    });
    return { url: `http://127.0.0.1:${server.address().port}/sharing`, writes };
}
const headers = { 'X-Plex-Token': 'active-account-fixture', 'Content-Type': 'application/json' };

test('Home library access identifies members by their Plex ID', async t => {
    const { url, writes } = await setup(t);
    const overview = await (await fetch(url, { headers })).json();
    assert.equal(overview.shares[0].userId, 2);
    const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ invitedId: 2, librarySectionIds: ['1'], allowDownloads: false }) });
    assert.equal(response.status, 201);
    assert.equal(writes[0][1].invitedId, 2);
    assert.equal(writes[0][1].invitedEmail, undefined);
    assert.deepEqual(writes[0][1].librarySectionIds, [1]);
    assert.equal(writes[0][2].headers['X-Plex-Token'], 'active-account-fixture');
});

test('invalid Home IDs and unavailable libraries fail before a cloud write', async t => {
    const { url, writes } = await setup(t);
    for (const invitedId of [0, -1, '2', null, 1.5]) {
        const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ invitedId, librarySectionIds: ['1'], allowDownloads: false }) });
        assert.equal(response.status, 400);
    }
    const missingLibrary = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ invitedId: 2, librarySectionIds: ['99'], allowDownloads: false }) });
    assert.equal(missingLibrary.status, 400);
    assert.equal(writes.length, 0);
});

test('a managed profile cannot change library access even with a forged recipient', async t => {
    const { url, writes } = await setup(t, true);
    const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ invitedId: 2, librarySectionIds: ['1'], allowDownloads: false }) });
    assert.equal(response.status, 403);
    assert.equal(writes.length, 0);
});

test('changing library access preserves existing rating, label and tuner restrictions', async t => {
    const { url, writes } = await setup(t);
    const response = await fetch(url + '/42', { method: 'PUT', headers, body: JSON.stringify({ librarySectionIds: ['1'], allowDownloads: true }) });
    assert.equal(response.status, 200);
    assert.equal(writes[0][1].settings.filterMovies, 'contentRating=PG');
    assert.equal(writes[0][1].settings.allowTuners, 1);
    assert.equal(writes[0][1].settings.allowSync, true);
});
