import axios, { type AxiosRequestConfig } from 'axios';
import express from 'express';
import https from 'node:https';
import { canManagePlexServer, CheckPlexUser, isPlexServerOwner } from './common/plex.js';
import { APP_VERSION } from './appVersion.js';

const PLEX_TV_URL = 'https://plex.tv/api/v2';

interface SharingSettings {
    allowSync?: boolean;
    [key: string]: unknown;
}

interface PlexShareUser {
    friendlyName?: string | null;
    title?: string | null;
    username?: string | null;
    home?: boolean;
}

interface PlexShareLibrary {
    key: string | number;
    title: string;
    type: string;
}

interface PlexShare {
    id: number;
    machineIdentifier: string;
    invitedEmail?: string | null;
    accepted?: boolean;
    invited?: PlexShareUser;
    libraries?: PlexShareLibrary[];
    allLibraries?: boolean;
    sharingSettings?: SharingSettings;
}

interface PendingInvite {
    sharedServers?: PlexShare[];
}

interface LocalLibrary {
    key: string | number;
    title: string;
    type: string;
}

interface SharingRouterOptions {
    plexServer: string;
    httpsAgent?: https.Agent;
}

function clientIdentifier(req: express.Request) {
    const candidate = req.headers['x-plex-client-identifier'];
    return typeof candidate === 'string' && /^[A-Za-z0-9._-]{1,128}$/.test(candidate)
        ? candidate
        : 'nevu-sharing-panel';
}

function cloudHeaders(req: express.Request, token: string) {
    return {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Plex-Token': token,
        'X-Plex-Product': 'NEVU',
        'X-Plex-Version': APP_VERSION,
        'X-Plex-Client-Identifier': clientIdentifier(req),
    };
}

function localRequestConfig(
    token: string,
    httpsAgent?: https.Agent,
): AxiosRequestConfig {
    return {
        headers: {
            Accept: 'application/json',
            'X-Plex-Token': token,
        },
        timeout: 10000,
        ...(httpsAgent && { httpsAgent }),
    };
}

function sharingSettings(
    allowDownloads: boolean,
    existing: SharingSettings = {},
): SharingSettings {
    return {
        allowChannels: false,
        filterMovies: null,
        filterMusic: null,
        filterPhotos: null,
        filterTelevision: null,
        filterAll: null,
        allowCameraUpload: false,
        allowSubtitleAdmin: false,
        allowTuners: 0,
        ...existing,
        allowSync: allowDownloads,
    };
}

function flattenShares(accepted: PlexShare[], pending: PendingInvite[]) {
    return [
        ...accepted,
        ...pending.flatMap((invite) => invite.sharedServers || []),
    ];
}

function normalizeShare(share: PlexShare) {
    const invited = share.invited;
    const account = invited?.username || share.invitedEmail || null;

    return {
        id: share.id,
        displayName:
            invited?.friendlyName ||
            invited?.title ||
            invited?.username ||
            share.invitedEmail ||
            'Plex user',
        account,
        home: Boolean(invited?.home),
        status: share.accepted ? 'active' : 'pending',
        librarySectionIds: (share.libraries || []).map((library) => String(library.key)),
        allLibraries: Boolean(share.allLibraries),
        allowDownloads: Boolean(share.sharingSettings?.allowSync),
    };
}

function plexErrorMessage(error: unknown) {
    if (!axios.isAxiosError(error)) return 'Plex sharing request failed';
    const data = error.response?.data;
    if (typeof data === 'object' && data) {
        const errors = (data as { errors?: Array<{ message?: string }> }).errors;
        if (errors?.[0]?.message) return errors[0].message;
        const message = (data as { message?: string }).message;
        if (message) return message;
    }
    return error.message || 'Plex sharing request failed';
}

function sendPlexError(res: express.Response, error: unknown) {
    const upstreamStatus = axios.isAxiosError(error) ? error.response?.status : undefined;
    const status = upstreamStatus && upstreamStatus >= 400 && upstreamStatus < 500
        ? upstreamStatus
        : 502;
    res.status(status).send({ error: plexErrorMessage(error) });
}

function shareId(value: string) {
    return /^\d+$/.test(value) ? Number(value) : null;
}

function requestedLibraries(body: unknown) {
    if (!body || typeof body !== 'object') return null;
    const ids = (body as { librarySectionIds?: unknown }).librarySectionIds;
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > 100) return null;
    if (!ids.every((id) => typeof id === 'string' && /^\d+$/.test(id))) return null;
    return [...new Set(ids)];
}

function requestedDownloads(body: unknown) {
    if (!body || typeof body !== 'object') return null;
    const value = (body as { allowDownloads?: unknown }).allowDownloads;
    return typeof value === 'boolean' ? value : null;
}

export function createPlexSharingRouter({
    plexServer,
    httpsAgent,
}: SharingRouterOptions) {
    const router = express.Router();

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
            res.status(403).send({ error: 'Sharing requires the Plex Home owner account' });
            return null;
        }

        try {
            const providers = await axios.get(
                `${plexServer}/media/providers`,
                localRequestConfig(token, httpsAgent),
            );
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

    async function serverContext(token: string) {
        const config = localRequestConfig(token, httpsAgent);
        const [identityResponse, librariesResponse] = await Promise.all([
            axios.get(`${plexServer}/identity`, config),
            axios.get(`${plexServer}/library/sections`, config),
        ]);
        const machineIdentifier = identityResponse.data?.MediaContainer?.machineIdentifier;
        const libraries = (librariesResponse.data?.MediaContainer?.Directory || []) as LocalLibrary[];
        if (typeof machineIdentifier !== 'string' || !machineIdentifier)
            throw new Error('Plex server identity is unavailable');

        return { machineIdentifier, libraries };
    }

    async function fetchShares(req: express.Request, token: string) {
        const config = {
            headers: cloudHeaders(req, token),
            timeout: 10000,
        };
        const [acceptedResponse, pendingResponse] = await Promise.all([
            axios.get(`${PLEX_TV_URL}/shared_servers/owned/accepted`, config),
            axios.get(`${PLEX_TV_URL}/shared_servers/invites/owned/pending`, config),
        ]);
        return flattenShares(
            acceptedResponse.data as PlexShare[],
            pendingResponse.data as PendingInvite[],
        );
    }

    async function validatedLibraries(
        token: string,
        body: unknown,
        res: express.Response,
    ) {
        const ids = requestedLibraries(body);
        if (!ids) {
            res.status(400).send({ error: 'Select at least one valid library' });
            return null;
        }

        const context = await serverContext(token);
        const available = new Set(context.libraries.map((library) => String(library.key)));
        if (ids.some((id) => !available.has(id))) {
            res.status(400).send({ error: 'One or more selected libraries do not exist' });
            return null;
        }
        return { ...context, ids };
    }

    router.get('/', async (req, res) => {
        const token = await authenticate(req, res);
        if (!token) return;

        try {
            const [{ machineIdentifier, libraries }, shares] = await Promise.all([
                serverContext(token),
                fetchShares(req, token),
            ]);
            res.send({
                libraries: libraries.map((library) => ({
                    id: String(library.key),
                    title: library.title,
                    type: library.type,
                })),
                shares: shares
                    .filter((share) => share.machineIdentifier === machineIdentifier)
                    .map(normalizeShare),
            });
        } catch (error) {
            sendPlexError(res, error);
        }
    });

    router.post('/', async (req, res) => {
        const token = await authenticate(req, res);
        if (!token) return;

        const invitedAccount = typeof req.body?.invitedAccount === 'string'
            ? req.body.invitedAccount.trim()
            : '';
        if (!invitedAccount || invitedAccount.length > 254) {
            return res.status(400).send({ error: 'Enter a valid Plex email or username' });
        }
        const allowDownloads = requestedDownloads(req.body);
        if (allowDownloads === null)
            return res.status(400).send({ error: 'Invalid download permission' });

        try {
            const context = await validatedLibraries(token, req.body, res);
            if (!context) return;
            await axios.post(
                `${PLEX_TV_URL}/shared_servers`,
                {
                    invitedEmail: invitedAccount,
                    machineIdentifier: context.machineIdentifier,
                    librarySectionIds: context.ids.map(Number),
                    settings: sharingSettings(allowDownloads),
                    skipFriendship: true,
                },
                { headers: cloudHeaders(req, token), timeout: 10000 },
            );
            res.status(201).send({ ok: true });
        } catch (error) {
            sendPlexError(res, error);
        }
    });

    router.put('/:id', async (req, res) => {
        const token = await authenticate(req, res);
        if (!token) return;
        const id = shareId(req.params.id);
        if (id === null) return res.status(400).send({ error: 'Invalid share ID' });
        const allowDownloads = requestedDownloads(req.body);
        if (allowDownloads === null)
            return res.status(400).send({ error: 'Invalid download permission' });

        try {
            const context = await validatedLibraries(token, req.body, res);
            if (!context) return;
            const shares = await fetchShares(req, token);
            const current = shares.find(
                (share) => share.id === id && share.machineIdentifier === context.machineIdentifier,
            );
            if (!current) return res.status(404).send({ error: 'Share not found' });

            await axios.post(
                `${PLEX_TV_URL}/shared_servers/${id}`,
                {
                    librarySectionIds: context.ids.map(Number),
                    settings: sharingSettings(
                        allowDownloads,
                        current.sharingSettings,
                    ),
                },
                { headers: cloudHeaders(req, token), timeout: 10000 },
            );
            res.send({ ok: true });
        } catch (error) {
            sendPlexError(res, error);
        }
    });

    router.delete('/:id', async (req, res) => {
        const token = await authenticate(req, res);
        if (!token) return;
        const id = shareId(req.params.id);
        if (id === null) return res.status(400).send({ error: 'Invalid share ID' });

        try {
            const [{ machineIdentifier }, shares] = await Promise.all([
                serverContext(token),
                fetchShares(req, token),
            ]);
            const current = shares.find(
                (share) => share.id === id && share.machineIdentifier === machineIdentifier,
            );
            if (!current) return res.status(404).send({ error: 'Share not found' });

            await axios.delete(`${PLEX_TV_URL}/shared_servers/${id}`, {
                headers: cloudHeaders(req, token),
                timeout: 10000,
            });
            res.send({ ok: true });
        } catch (error) {
            sendPlexError(res, error);
        }
    });

    return router;
}
