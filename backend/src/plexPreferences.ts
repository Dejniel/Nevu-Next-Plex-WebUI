import axios from 'axios';
import express from 'express';
import {
    normalizePlexPreferences,
    validatePreferenceChanges,
} from '@nevu/contracts';
import {
    plexManagement,
    sendPlexManagementError,
    type PlexManagementOptions,
} from './common/plexManagement.js';

export function createPlexPreferencesRouter(options: PlexManagementOptions) {
    const router = express.Router();
    const { authenticate, requestConfig } = plexManagement(options);
    async function preferences(token: string) {
        const response = await axios.get(
            `${options.plexServer}/:/prefs`,
            requestConfig(token),
        );
        return normalizePlexPreferences(response.data?.MediaContainer?.Setting);
    }
    router.get('/', async (req, res) => {
        const token = await authenticate(req, res);
        if (!token) return;
        try {
            res.send({ preferences: await preferences(token) });
        } catch (error) {
            sendPlexManagementError(res, error);
        }
    });
    router.put('/', async (req, res) => {
        const token = await authenticate(req, res);
        if (!token) return;
        try {
            const settings = await preferences(token);
            let changes;
            try {
                changes = validatePreferenceChanges(
                    settings,
                    req.body?.preferences,
                );
            } catch (error) {
                return res
                    .status(400)
                    .send({
                        error:
                            error instanceof Error
                                ? error.message
                                : 'Invalid preferences.',
                    });
            }
            if (Object.keys(changes).length) {
                await axios.put(`${options.plexServer}/:/prefs`, undefined, {
                    ...requestConfig(token),
                    params: changes,
                });
            }
            res.send({ changes });
        } catch (error) {
            sendPlexManagementError(res, error);
        }
    });
    return router;
}
