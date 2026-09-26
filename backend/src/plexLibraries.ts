import axios, { AxiosRequestConfig } from 'axios';
import express from 'express';
import https from 'https';
import {
    LIBRARY_PRESETS,
    libraryKind,
    libraryLanguage,
    libraryLocations,
    libraryName,
    sectionId,
} from './common/libraryRules';
import { canManagePlexServer, CheckPlexUser, isPlexServerOwner } from './common/plex';

interface LibrariesRouterOptions {
    plexServer: string;
    httpsAgent?: https.Agent;
}

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

interface PlexPreference {
    id?: string;
    label?: string;
    summary?: string;
    type?: string;
    value?: unknown;
    default?: unknown;
    enumValues?: unknown;
    hidden?: boolean;
}

function plexErrorMessage(error: unknown) {
    if (!axios.isAxiosError(error)) return 'Plex library request failed';
    const data = error.response?.data;
    if (typeof data === 'object' && data) {
        const message = (data as { message?: string; error?: string }).message ||
            (data as { message?: string; error?: string }).error;
        if (message) return message;
    }
    if (typeof data === 'string' && data.trim()) return data.trim();
    return error.message || 'Plex library request failed';
}

function sendPlexError(res: express.Response, error: unknown) {
    const upstream = axios.isAxiosError(error) ? error.response?.status : undefined;
    const status = upstream && upstream >= 400 && upstream < 500 ? upstream : 502;
    res.status(status).send({ error: plexErrorMessage(error) });
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

function mapPreference(preference: PlexPreference) {
    return {
        id: preference.id || '',
        label: preference.label || preference.id || '',
        summary: preference.summary || '',
        type: preference.type || 'text',
        value: preference.value,
        default: preference.default,
        enumValues: typeof preference.enumValues === 'string' ? preference.enumValues : '',
        hidden: Boolean(preference.hidden),
    };
}

export function createPlexLibrariesRouter({
    plexServer,
    httpsAgent,
}: LibrariesRouterOptions) {
    const router = express.Router();

    function requestConfig(token: string): AxiosRequestConfig {
        return {
            headers: {
                Accept: 'application/json',
                'X-Plex-Token': token,
                'X-Plex-Pms-Api-Version': '1.2.3',
            },
            timeout: 20000,
            ...(httpsAgent && { httpsAgent }),
        };
    }

    async function authenticate(req: express.Request, res: express.Response) {
        const token = req.headers['x-plex-token'];
        if (typeof token !== 'string' || !token) {
            res.status(401).send({ error: 'The active Plex session is missing' });
            return null;
        }

        const user = await CheckPlexUser(token);
        if (!user) {
            res.status(401).send({ error: 'The active Plex session has expired' });
            return null;
        }
        if (!isPlexServerOwner(user)) {
            res.status(403).send({ error: 'Library management requires the Plex Home owner' });
            return null;
        }

        try {
            const providers = await axios.get(`${plexServer}/media/providers`, requestConfig(token));
            if (!canManagePlexServer(user, providers.data)) {
                res.status(403).send({ error: 'This Plex session cannot manage the server' });
                return null;
            }
        } catch (error) {
            sendPlexError(res, error);
            return null;
        }
        return token;
    }

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
        return response.data?.MediaContainer?.Setting || [];
    }

    async function validatedPreferences(token: string, id: string, value: unknown) {
        if (value === undefined) return {} as Record<string, string>;
        if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

        const available = new Map(
            (await preferences(token, id))
                .filter((setting) => setting.id && !setting.hidden)
                .map((setting) => [setting.id as string, setting]),
        );
        const result: Record<string, string> = {};

        for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
            const setting = available.get(key);
            if (!setting) return null;
            const candidate = String(raw);
            if (candidate.length > 1024) return null;

            if (setting.type === 'bool' && !['true', 'false', '0', '1'].includes(candidate))
                return null;
            if (setting.type === 'int' && !/^-?\d+$/.test(candidate)) return null;
            if (typeof setting.enumValues === 'string' && setting.enumValues) {
                const allowed = setting.enumValues.split('|').map((entry) => entry.split(':', 1)[0]);
                if (!allowed.includes(candidate)) return null;
            }
            result[key] = candidate;
        }
        return result;
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
            res.send({ library: mapLibrary(library), preferences: prefs.map(mapPreference) });
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
        const name = libraryName(req.body?.name);
        const language = libraryLanguage(req.body?.language);
        const locations = libraryLocations(req.body?.locations);
        if (!id || !name || !language || !locations)
            return res.status(400).send({ error: 'Invalid library configuration' });

        try {
            const library = await existingLibrary(token, id);
            if (!library) return res.status(404).send({ error: 'Library not found' });
            const prefs = await validatedPreferences(token, id, req.body?.preferences);
            if (!prefs) return res.status(400).send({ error: 'Invalid library preference' });
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
