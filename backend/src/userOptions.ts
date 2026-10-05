import express from 'express';
import type { PrismaClient } from './generated/prisma/client.js';
import { CheckPlexUser } from './common/plex.js';

interface UserOptionsRouterOptions {
    prisma: Pick<PrismaClient, 'userOption'>;
    checkPlexUser?: typeof CheckPlexUser;
}

export function createUserOptionsRouter({ prisma, checkPlexUser = CheckPlexUser }: UserOptionsRouterOptions) {
    const router = express.Router();

    router.use(async (req, res, next) => {
        const token = req.headers['x-plex-token'];
        if (typeof token !== 'string' || !token) return res.status(401).send('Unauthorized');
        const user = await checkPlexUser(token);
        if (!user) return res.status(401).send('Unauthorized user');
        res.locals.userUid = user.uuid;
        next();
    });

    router.get('/', async (_req, res) => {
        res.send(await prisma.userOption.findMany({ where: { userUid: res.locals.userUid } }));
    });

    router.get('/:key', async (req, res) => {
        const option = await prisma.userOption.findFirst({
            where: { userUid: res.locals.userUid, key: req.params.key },
        });
        if (!option) return res.status(404).send('Option not found');
        res.send(option);
    });

    router.post('/', async (req, res) => {
        const { key, value } = req.body ?? {};
        if (typeof key !== 'string' || !key || typeof value !== 'string' || !value)
            return res.status(400).send('Bad request');
        const userUid: string = res.locals.userUid;
        res.send(await prisma.userOption.upsert({
            where: { userUid_key: { userUid, key } },
            update: { value },
            create: { userUid, key, value },
        }));
    });

    return router;
}
