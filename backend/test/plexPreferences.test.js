import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import express from 'express';
import axios from 'axios';
import { createPlexPreferencesRouter } from '../dist/plexPreferences.js';
import { createPlexLibrariesRouter } from '../dist/plexLibraries.js';

const settings = [
    {
        id: 'FriendlyName',
        label: 'Name',
        type: 'text',
        value: 'Test',
        default: '',
        group: 'general',
    },
    {
        id: 'enabled',
        label: 'Enabled',
        summary: 'Help',
        type: 'bool',
        value: false,
        default: true,
        advanced: true,
        group: 'network',
    },
    {
        id: 'count',
        type: 'int',
        value: 2,
        default: 1,
        enumValues: '1:One|2:Two|3:Three',
    },
    { id: 'ratio', type: 'double', value: 0.75, default: 0.5 },
    {
        id: 'language',
        type: 'text',
        value: '',
        default: '',
        enumValues: ':Account default|pl:Polish: native',
    },
    { id: 'secret', type: 'text', value: 'never-expose', hidden: '1' },
    { id: 'unsupported', type: 'future', value: 'current' },
];
const headers = {
    'X-Plex-Token': 'manager-fixture',
    'Content-Type': 'application/json',
};

test('partial library edits use fresh server values for unchanged general fields', async (t) => {
    const { url, writes } = await setup(t);
    const response = await fetch(`${url}/libraries/1`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ preferences: { ratio: '0.9' } }),
    });
    assert.equal(response.status, 200);
    const query = new URL(writes[0][0]).searchParams;
    assert.equal(query.get('name'), 'Movies');
    assert.equal(query.get('language'), 'en-US');
    assert.deepEqual(query.getAll('location'), ['/data']);
    const unchanged = await fetch(`${url}/libraries/1`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ preferences: { ratio: '0.750' } }),
    });
    assert.equal(unchanged.status, 200);
    assert.equal(writes.length, 1);
});

test('library creation uses the native sections endpoint and the selected type agent', async (t) => {
    const { url, writes } = await setup(t);
    const response = await fetch(`${url}/libraries`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: 'Matching', type: 'movie', language: 'en-US', locations: ['/samples'] }),
    });
    assert.equal(response.status, 201);
    const target = new URL(writes[0][0]);
    assert.equal(target.pathname, '/library/sections');
    assert.equal(target.searchParams.get('agent'), 'tv.plex.agents.movie');
    assert.equal(target.searchParams.get('type'), '1');
    assert.deepEqual(target.searchParams.getAll('location'), ['/samples']);
    assert.equal(target.searchParams.has('locations'), false);
    assert.equal(writes[0][2].headers['X-Plex-Pms-Api-Version'], '1.2.3');
});

async function setup(
    t,
    { restricted = false, manage = true, user = true } = {},
) {
    const original = { get: axios.get, put: axios.put, post: axios.post };
    const writes = [];
    axios.get = async (url, config) => {
        assert.equal(config.headers['X-Plex-Token'], 'manager-fixture');
        if (url.endsWith('/api/v2/user'))
            return { data: user ? { restricted } : null };
        if (url.endsWith('/media/providers'))
            return {
                data: { Feature: [{ type: manage ? 'manage' : 'search' }] },
            };
        if (url.endsWith('/prefs'))
            return { data: { MediaContainer: { Setting: settings } } };
        if (url.endsWith('/library/sections'))
            return {
                data: {
                    MediaContainer: {
                        Directory: [
                            {
                                key: '1',
                                title: 'Movies',
                                type: 'movie',
                                scanner: 'scanner',
                                agent: 'agent',
                                language: 'en-US',
                                Location: [{ path: '/data' }],
                            },
                        ],
                    },
                },
            };
        assert.fail(`Unexpected read: ${url}`);
    };
    axios.put = async (...args) => {
        writes.push(args);
        return { data: {} };
    };
    axios.post = async (...args) => {
        writes.push(args);
        return { data: {} };
    };
    const app = express();
    app.use(express.json());
    app.use(
        '/server-preferences',
        createPlexPreferencesRouter({ plexServer: 'http://fixture' }),
    );
    app.use(
        '/libraries',
        createPlexLibrariesRouter({ plexServer: 'http://fixture' }),
    );
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    t.after(async () => {
        Object.assign(axios, original);
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
    });
    return { url: `http://127.0.0.1:${server.address().port}`, writes };
}

test('server and library preferences share the normalized descriptor without hidden values', async (t) => {
    const { url } = await setup(t);
    const server = await (
        await fetch(`${url}/server-preferences`, { headers })
    ).json();
    const library = await (
        await fetch(`${url}/libraries/1`, { headers })
    ).json();
    assert.deepEqual(server.preferences, library.preferences);
    assert.equal(
        server.preferences.find((setting) => setting.id === 'secret'),
        undefined,
    );
    const enabled = server.preferences.find(
        (setting) => setting.id === 'enabled',
    );
    assert.equal(enabled.value, '0');
    assert.equal(enabled.default, '1');
    assert.equal(enabled.advanced, true);
    assert.equal(enabled.group, 'network');
    assert.equal(enabled.summary, 'Help');
    assert.deepEqual(
        server.preferences.find((setting) => setting.id === 'language').choices,
        [
            { value: '', label: 'Account default' },
            { value: 'pl', label: 'Polish: native' },
        ],
    );
});

test('a server save sends only validated changed values with a header token', async (t) => {
    const { url, writes } = await setup(t);
    const response = await fetch(`${url}/server-preferences`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
            preferences: {
                FriendlyName: 'New',
                enabled: true,
                count: '2',
                ratio: '0.5',
            },
        }),
    });
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).changes, {
        FriendlyName: 'New',
        enabled: '1',
        ratio: '0.5',
    });
    assert.equal(writes.length, 1);
    assert.equal(writes[0][0], 'http://fixture/:/prefs');
    assert.deepEqual(writes[0][2].params, {
        FriendlyName: 'New',
        enabled: '1',
        ratio: '0.5',
    });
    assert.equal(writes[0][2].headers['X-Plex-Token'], 'manager-fixture');
});

test('unchanged preferences never start a PMS write', async (t) => {
    const { url, writes } = await setup(t);
    for (const preferences of [
        {},
        { enabled: 'false', ratio: '0.750', count: '2' },
    ]) {
        const response = await fetch(`${url}/server-preferences`, {
            method: 'PUT',
            headers,
            body: JSON.stringify({ preferences }),
        });
        assert.equal(response.status, 200);
        assert.deepEqual((await response.json()).changes, {});
    }
    assert.equal(writes.length, 0);
});

test('library saves use the same validation and omit untouched preferences', async (t) => {
    const { url, writes } = await setup(t);
    const response = await fetch(`${url}/libraries/1`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
            name: 'Movies',
            language: 'en-US',
            locations: ['/data'],
            preferences: { ratio: '0.9', enabled: false, language: '' },
        }),
    });
    assert.equal(response.status, 200);
    const query = new URL(writes[0][0]).searchParams;
    assert.equal(query.get('prefs[ratio]'), '0.9');
    assert.equal(query.has('prefs[enabled]'), false);
    assert.equal(query.has('prefs[language]'), false);
    assert.equal(query.get('scanner'), 'scanner');
});

test('invalid, hidden, unknown and unsupported preferences fail before writing', async (t) => {
    const { url, writes } = await setup(t);
    const invalid = [
        null,
        [],
        { secret: 'value' },
        { absent: 'value' },
        { unsupported: 'new' },
        { enabled: 'yes' },
        { count: '2.5' },
        { count: '4' },
        { ratio: '' },
        { ratio: 'NaN' },
        { ratio: {} },
        { FriendlyName: 123 },
        { language: 'en' },
    ];
    for (const preferences of invalid) {
        for (const path of ['/server-preferences', '/libraries/1']) {
            const response = await fetch(url + path, {
                method: 'PUT',
                headers,
                body: JSON.stringify({
                    name: 'Movies',
                    language: 'en-US',
                    locations: ['/data'],
                    preferences,
                }),
            });
            assert.equal(response.status, 400, JSON.stringify(preferences));
        }
    }
    assert.equal(writes.length, 0);
});

for (const [options, status] of [
    [{ restricted: true }, 403],
    [{ manage: false }, 403],
    [{ user: false }, 401],
]) {
    test(`server settings enforce active account and PMS manage permission: ${JSON.stringify(options)}`, async (t) => {
        const { url, writes } = await setup(t, options);
        for (const method of ['GET', 'PUT']) {
            const response = await fetch(`${url}/server-preferences`, {
                method,
                headers,
                ...(method === 'PUT' && {
                    body: JSON.stringify({
                        preferences: { FriendlyName: 'New' },
                    }),
                }),
            });
            assert.equal(response.status, status);
        }
        assert.equal(writes.length, 0);
    });
}

test('missing credentials fail without contacting Plex', async (t) => {
    const { url, writes } = await setup(t);
    assert.equal((await fetch(`${url}/server-preferences`)).status, 401);
    assert.equal(writes.length, 0);
});
