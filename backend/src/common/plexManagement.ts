import axios, { type AxiosRequestConfig } from 'axios';
import type express from 'express';
import type https from 'node:https';
import {
    canManagePlexServer,
    CheckPlexUser,
    isUnrestrictedPlexAccount,
} from './plex.js';

export interface PlexManagementOptions {
    plexServer: string;
    httpsAgent?: https.Agent;
}

export function sendPlexManagementError(res: express.Response, error: unknown) {
    const response = axios.isAxiosError(error) ? error.response : undefined;
    const data = response?.data;
    const message =
        typeof data === 'object' && data
            ? data.message || data.error
            : typeof data === 'string'
              ? data.trim()
              : undefined;
    const status = response?.status;
    res.status(status && status >= 400 && status < 500 ? status : 502).send({
        error:
            typeof message === 'string' && message
                ? message
                : 'Plex server request failed.',
    });
}

export function plexManagement({
    plexServer,
    httpsAgent,
}: PlexManagementOptions) {
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
            res.status(401).send({
                error: 'The active Plex session is missing',
            });
            return null;
        }
        const user = await CheckPlexUser(token);
        if (!user) {
            res.status(401).send({
                error: 'The active Plex session has expired',
            });
            return null;
        }
        if (!isUnrestrictedPlexAccount(user)) {
            res.status(403).send({
                error: 'Server management requires an unrestricted Plex account',
            });
            return null;
        }
        try {
            const providers = await axios.get(
                `${plexServer}/media/providers`,
                requestConfig(token),
            );
            if (!canManagePlexServer(user, providers.data)) {
                res.status(403).send({
                    error: 'This Plex session cannot manage the server',
                });
                return null;
            }
        } catch (error) {
            sendPlexManagementError(res, error);
            return null;
        }
        return token;
    }
    return { authenticate, requestConfig };
}
