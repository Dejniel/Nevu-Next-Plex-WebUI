import type { PrismaClient } from './generated/prisma/client.js';
import axios from 'axios';
import express from 'express';
import { CheckPlexUser } from './common/plex.js';

const DEFAULT_NEVU_HUB_URL = 'https://gnuqknwmixeunfmeseep.supabase.co/functions/v1/';

type ReviewsDatabase = Pick<
    PrismaClient,
    'nevuReviewsLocal' | '$transaction'
>;

type ReviewVisibility = 'GLOBAL' | 'LOCAL';

interface ReviewRecord {
    created_at: string | Date;
    visibility: ReviewVisibility;
    [key: string]: unknown;
}

interface ReviewsRouterOptions {
    prisma: ReviewsDatabase;
    globalReviewsEnabled: boolean;
    checkPlexUser?: typeof CheckPlexUser;
    hubClient?: Pick<typeof axios, 'post'>;
    nevuHubUrl?: string;
}

function visibility(value: unknown): ReviewVisibility | null {
    return value === 'GLOBAL' || value === 'LOCAL' ? value : null;
}

function hubErrorMessage(error: unknown, fallback: string) {
    if (!axios.isAxiosError(error)) return fallback;
    const data = error.response?.data;
    if (data && typeof data === 'object' && typeof (data as { error?: unknown }).error === 'string')
        return (data as { error: string }).error;
    return error.message || fallback;
}

function responseError(data: unknown) {
    if (!data || typeof data !== 'object') return null;
    const error = (data as { error?: unknown }).error;
    return typeof error === 'string' && error ? error : null;
}

export function createReviewsRouter({
    prisma,
    globalReviewsEnabled,
    checkPlexUser = CheckPlexUser,
    hubClient = axios,
    nevuHubUrl = DEFAULT_NEVU_HUB_URL,
}: ReviewsRouterOptions) {
    const router = express.Router();

    async function authenticate(req: express.Request, res: express.Response) {
        const token = req.headers['x-plex-token'];
        if (typeof token !== 'string' || !token) {
            res.status(401).send({ error: 'The active Plex session is missing' });
            return null;
        }

        const user = await checkPlexUser(token);
        if (!user) {
            res.status(401).send({ error: 'The active Plex session has expired' });
            return null;
        }
        return { token, user };
    }

    router.get('/', async (req, res) => {
        const session = await authenticate(req, res);
        if (!session) return;
        const itemID = typeof req.query.itemID === 'string' ? req.query.itemID : '';
        const userID = typeof req.query.userID === 'string' ? req.query.userID : undefined;
        if (!itemID.startsWith('plex://'))
            return res.status(400).send({ error: 'Invalid itemID' });
        if (req.query.userID !== undefined && !userID)
            return res.status(400).send({ error: 'Invalid userID' });

        try {
            const reviews: ReviewRecord[] = (await prisma.nevuReviewsLocal.findMany({
                where: { itemID, ...(userID && { userID }) },
                include: {
                    user: { select: { id: true, username: true, avatar: true } },
                },
                orderBy: { created_at: 'desc' },
            })).map((review) => ({ ...review, visibility: 'LOCAL' as const }));

            if (globalReviewsEnabled) {
                try {
                    const response = await hubClient.post(`${nevuHubUrl}review-get`, {
                        itemID,
                        ...(userID && { userID }),
                    }, {
                        headers: { 'x-plex-token': session.token },
                        timeout: 8000,
                    });
                    const remote = response?.data?.data;
                    if (!Array.isArray(remote))
                        throw new Error(responseError(response?.data) || 'Invalid Nevu Community response');
                    reviews.push(...remote
                        .filter((review): review is Record<string, unknown> & { created_at: string } =>
                            Boolean(
                                review &&
                                typeof review === 'object' &&
                                typeof review.created_at === 'string',
                            )
                        )
                        .map((review) => ({ ...review, visibility: 'GLOBAL' as const })));
                } catch (error) {
                    console.warn('Could not fetch Nevu Community reviews:', hubErrorMessage(
                        error,
                        error instanceof Error ? error.message : 'Request failed',
                    ));
                }
            }

            reviews.sort((a, b) =>
                new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            );
            res.setHeader('Cache-Control', 'private, no-store');
            res.send(reviews);
        } catch (error) {
            console.error('Error fetching local reviews:', error);
            res.status(500).send({ error: 'Could not load reviews from this Nevu server' });
        }
    });

    router.post('/', async (req, res) => {
        const session = await authenticate(req, res);
        if (!session) return;
        const itemID = typeof req.body?.itemID === 'string' ? req.body.itemID : '';
        const message = typeof req.body?.message === 'string' ? req.body.message.trim() : null;
        const rating = req.body?.rating;
        const spoilers = req.body?.spoilers;
        const reviewVisibility = visibility(req.body?.visibility);

        if (!itemID.startsWith('plex://'))
            return res.status(400).send({ error: 'Invalid itemID' });
        if (message === null || message.length > 256)
            return res.status(400).send({ error: 'Review text must be at most 256 characters' });
        if (typeof rating !== 'number' || !Number.isFinite(rating) || rating < 0 || rating > 10)
            return res.status(400).send({ error: 'Rating must be between 0 and 10' });
        if (!message && rating === 0)
            return res.status(400).send({ error: 'Add a rating or review text' });
        if (typeof spoilers !== 'boolean')
            return res.status(400).send({ error: 'Invalid spoiler setting' });
        if (!reviewVisibility)
            return res.status(400).send({ error: 'Invalid visibility' });
        if (reviewVisibility === 'GLOBAL' && !globalReviewsEnabled)
            return res.status(403).send({ error: 'Nevu Community reviews are disabled' });

        try {
            if (reviewVisibility === 'GLOBAL') {
                const response = await hubClient.post(`${nevuHubUrl}review-update`, {
                    itemID,
                    userID: session.user.uuid,
                    message,
                    rating,
                    spoilers,
                }, {
                    headers: { 'x-plex-token': session.token },
                    timeout: 8000,
                });
                const error = responseError(response?.data);
                if (error) return res.status(502).send({ error });
            } else {
                await prisma.$transaction(async (database) => {
                    await database.nevuReviewsLocalUsers.upsert({
                        where: { id: session.user.uuid },
                        create: {
                            id: session.user.uuid,
                            username: session.user.friendlyName || session.user.username,
                            avatar: session.user.thumb || '',
                        },
                        update: {
                            username: session.user.friendlyName || session.user.username,
                            avatar: session.user.thumb || '',
                        },
                    });
                    await database.nevuReviewsLocal.upsert({
                        where: { itemID_userID: { itemID, userID: session.user.uuid } },
                        create: { itemID, userID: session.user.uuid, message, rating, spoilers },
                        update: { message, rating, spoilers },
                    });
                });
            }
            res.setHeader('Cache-Control', 'no-store');
            res.send({ ok: true });
        } catch (error) {
            console.error('Error saving review:', error);
            if (reviewVisibility === 'GLOBAL')
                return res.status(502).send({
                    error: hubErrorMessage(error, 'Could not save the Nevu Community review'),
                });
            res.status(500).send({ error: 'Could not save the review on this Nevu server' });
        }
    });

    router.delete('/', async (req, res) => {
        const session = await authenticate(req, res);
        if (!session) return;
        const itemID = typeof req.query.itemID === 'string' ? req.query.itemID : '';
        const reviewVisibility = visibility(req.query.visibility);
        if (!itemID.startsWith('plex://'))
            return res.status(400).send({ error: 'Invalid itemID' });
        if (!reviewVisibility)
            return res.status(400).send({ error: 'Invalid visibility' });
        if (reviewVisibility === 'GLOBAL' && !globalReviewsEnabled)
            return res.status(403).send({ error: 'Nevu Community reviews are disabled' });

        try {
            if (reviewVisibility === 'GLOBAL') {
                const response = await hubClient.post(`${nevuHubUrl}review-delete`, { itemID }, {
                    headers: { 'x-plex-token': session.token },
                    timeout: 8000,
                });
                const error = responseError(response?.data);
                if (error) return res.status(502).send({ error });
            } else {
                await prisma.nevuReviewsLocal.deleteMany({
                    where: { itemID, userID: session.user.uuid },
                });
            }
            res.setHeader('Cache-Control', 'no-store');
            res.send({ ok: true });
        } catch (error) {
            console.error('Error deleting review:', error);
            if (reviewVisibility === 'GLOBAL')
                return res.status(502).send({
                    error: hubErrorMessage(error, 'Could not delete the Nevu Community review'),
                });
            res.status(500).send({ error: 'Could not delete the review from this Nevu server' });
        }
    });

    return router;
}
