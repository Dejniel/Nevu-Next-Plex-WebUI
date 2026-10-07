import axios from 'axios';
import { normalizePlexPreferences, validatePreferenceChanges, type PlexPreference } from '@nevu/contracts';
import express from 'express';
import {
    LIBRARY_PRESETS,
    libraryKind,
    libraryLanguage,
    libraryLocations,
    libraryName,
    sectionId,
} from './common/libraryRules.js';
import { plexManagement, sendPlexManagementError as sendPlexError, type PlexManagementOptions } from './common/plexManagement.js';

interface PlexLocation {
    id?: number;
    path?: string;
}

interface PlexLibrary {
    key: string | number;
    uuid?: string;
    title?: string;
    type?: string;
    agent?: string;
    scanner?: string;
    language?: string;
    refreshing?: boolean;
    updatedAt?: number;
    scannedAt?: number;
    Location?: PlexLocation[];
}

function mapLibrary(library: PlexLibrary) {
    return {
        id: String(library.key),
        uuid: library.uuid || String(library.key),
        title: library.title || 'Untitled library',
        type: library.type || 'unknown',
        agent: library.agent || '',
        scanner: library.scanner || '',
        language: library.language || 'en-US',
        refreshing: Boolean(library.refreshing),
        updatedAt: library.updatedAt || null,
        scannedAt: library.scannedAt || null,
        locations: (library.Location || [])
            .map((location) => location.path)
            .filter((path): path is string => Boolean(path)),
    };
}

export function createPlexLibrariesRouter({
    plexServer,
    httpsAgent,
}: PlexManagementOptions) {
    const router = express.Router();

    const { authenticate, requestConfig } = plexManagement({ plexServer, httpsAgent });

    async function libraries(token: string): Promise<PlexLibrary[]> {
        const response = await axios.get(
            `${plexServer}/library/sections`,
            requestConfig(token),
        );
        return response.data?.MediaContainer?.Directory || [];
    }

    async function existingLibrary(token: string, id: string) {
        return (await libraries(token)).find((library) => String(library.key) === id) || null;
    }

    async function preferences(token: string, id: string): Promise<PlexPreference[]> {
        const response = await axios.get(
            `${plexServer}/library/sections/${id}/prefs`,
            requestConfig(token),
        );
        return normalizePlexPreferences(response.data?.MediaContainer?.Setting || []);
    }

    function sectionParams(
        input: { name: string; language: string; locations: string[] },
        scanner: string,
        agent: string,
        prefs: Record<string, string> = {},
    ) {
        const params = new URLSearchParams({
            name: input.name,
            language: input.language,
            scanner,
            agent,
        });
        input.locations.forEach((location) => params.append('locations', location));
        Object.entries(prefs).forEach(([key, value]) => params.set(`prefs[${key}]`, value));
        return params;
    }

    router.get('/', async (req, res) => {
        const token = await authenticate(req, res);
        if (!token) return;
        try {
            res.send({ libraries: (await libraries(token)).map(mapLibrary) });
        } catch (error) {
            sendPlexError(res, error);
        }
    });

    router.get('/browse', async (req, res) => {
        const token = await authenticate(req, res);
        if (!token) return;
        const key = typeof req.query.key === 'string'
            ? req.query.key
            : '/services/browse/Lw==';
        if (!/^\/services\/browse\/[A-Za-z0-9+_-]+={0,2}$/.test(key))
            return res.status(400).send({ error: 'Invalid Plex browse key' });

        try {
            const config = requestConfig(token);
            config.params = { includeFiles: 0 };
            const response = await axios.get(`${plexServer}${key}`, config);
            const paths = (response.data?.MediaContainer?.Path || []) as Array<{
                key?: string;
                title?: string;
                path?: string;
            }>;
            res.send({
                paths: paths
                    .filter((path) => path.key && path.title && path.path)
                    .map((path) => ({ key: path.key, title: path.title, path: path.path })),
            });
        } catch (error) {
            sendPlexError(res, error);
        }
    });

    router.get('/:id', async (req, res) => {
        const token = await authenticate(req, res);
        if (!token) return;
        const id = sectionId(req.params.id);
        if (!id) return res.status(400).send({ error: 'Invalid library ID' });

        try {
            const [library, prefs] = await Promise.all([
                existingLibrary(token, id),
                preferences(token, id),
            ]);
            if (!library) return res.status(404).send({ error: 'Library not found' });
            res.send({ library: mapLibrary(library), preferences: prefs });
        } catch (error) {
            sendPlexError(res, error);
        }
    });

    router.post('/', async (req, res) => {
        const token = await authenticate(req, res);
        if (!token) return;
        const name = libraryName(req.body?.name);
        const language = libraryLanguage(req.body?.language);
        const locations = libraryLocations(req.body?.locations);
        const kind = libraryKind(req.body?.type);
        if (!name || !language || !locations || !kind)
            return res.status(400).send({ error: 'Invalid library configuration' });

        const preset = LIBRARY_PRESETS[kind];
        const params = sectionParams({ name, language, locations }, preset.scanner, preset.agent);
        params.set('type', String(preset.plexType));
        try {
            await axios.post(
                `${plexServer}/library/sections/all?${params.toString()}`,
                undefined,
                requestConfig(token),
            );
            res.status(201).send({ ok: true });
        } catch (error) {
            sendPlexError(res, error);
        }
    });

    router.put('/:id', async (req, res) => {
        const token = await authenticate(req, res);
        if (!token) return;
        const id = sectionId(req.params.id);
        if (!id) return res.status(400).send({ error: 'Invalid library ID' });

        if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body))
            return res.status(400).send({ error: 'Invalid library configuration' });
        try {
            const library = await existingLibrary(token, id);
            if (!library) return res.status(404).send({ error: 'Library not found' });
            const currentLocations = (library.Location || []).map((location) => location.path).filter(Boolean);
            const name = libraryName(req.body?.name === undefined ? library.title : req.body.name);
            const language = libraryLanguage(req.body?.language === undefined ? library.language : req.body.language);
            const locations = libraryLocations(req.body?.locations === undefined ? currentLocations : req.body.locations);
            if (!name || !language || !locations)
                return res.status(400).send({ error: 'Invalid library configuration' });
            let prefs: Record<string, string> = {};
            if (req.body?.preferences !== undefined) {
                const available = await preferences(token, id);
                try { prefs = validatePreferenceChanges(available, req.body.preferences); }
                catch (error) {
                    return res.status(400).send({ error: error instanceof Error ? error.message : 'Invalid library preference' });
                }
            }
            if (name === library.title && language === library.language &&
                JSON.stringify(locations) === JSON.stringify(currentLocations) && !Object.keys(prefs).length)
                return res.send({ ok: true });
            const params = sectionParams(
                { name, language, locations },
                library.scanner || '',
                library.agent || '',
                prefs,
            );
            await axios.put(
                `${plexServer}/library/sections/${id}?${params.toString()}`,
                undefined,
                requestConfig(token),
            );
            res.send({ ok: true });
        } catch (error) {
            sendPlexError(res, error);
        }
    });

    router.delete('/:id', async (req, res) => {
        const token = await authenticate(req, res);
        if (!token) return;
        const id = sectionId(req.params.id);
        if (!id) return res.status(400).send({ error: 'Invalid library ID' });

        try {
            const library = await existingLibrary(token, id);
            if (!library) return res.status(404).send({ error: 'Library not found' });
            if (req.body?.confirmTitle !== library.title)
                return res.status(400).send({ error: 'Library name confirmation does not match' });
            const config = requestConfig(token);
            config.params = { async: 1 };
            await axios.delete(`${plexServer}/library/sections/${id}`, config);
            res.status(202).send({ ok: true });
        } catch (error) {
            sendPlexError(res, error);
        }
    });

    router.post('/:id/:action', async (req, res) => {
        const token = await authenticate(req, res);
        if (!token) return;
        const id = sectionId(req.params.id);
        if (!id) return res.status(400).send({ error: 'Invalid library ID' });

        const actions: Record<string, { method: 'post' | 'put'; path: string; params?: object }> = {
            scan: { method: 'post', path: 'refresh' },
            'refresh-metadata': { method: 'post', path: 'refresh', params: { force: 1 } },
            analyze: { method: 'put', path: 'analyze' },
            'empty-trash': { method: 'put', path: 'emptyTrash' },
        };
        const action = actions[req.params.action];
        if (!action) return res.status(404).send({ error: 'Unknown library action' });

        try {
            if (!await existingLibrary(token, id))
                return res.status(404).send({ error: 'Library not found' });
            await axios.request({
                ...requestConfig(token),
                method: action.method,
                url: `${plexServer}/library/sections/${id}/${action.path}`,
                params: action.params,
            });
            res.send({ ok: true });
        } catch (error) {
            sendPlexError(res, error);
        }
    });

    return router;
}
