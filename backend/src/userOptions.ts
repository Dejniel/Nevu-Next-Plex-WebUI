import express from 'express';
import type { UserOptionsDatabase } from './database.js';
import { CheckPlexUser } from './common/plex.js';

interface UserOptionsRouterOptions {
    database: Pick<UserOptionsDatabase, 'getOptions' | 'getOption' | 'setOption'>;
    checkPlexUser?: typeof CheckPlexUser;
}

export function createUserOptionsRouter({ database, checkPlexUser = CheckPlexUser }: UserOptionsRouterOptions) {
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
        res.send(database.getOptions(res.locals.userUid));
    });

    router.get('/:key', async (req, res) => {
        const option = database.getOption(res.locals.userUid, req.params.key);
        if (!option) return res.status(404).send('Option not found');
        res.send(option);
    });

    router.post('/', async (req, res) => {
        const { key, value } = req.body ?? {};
        if (typeof key !== 'string' || !key || typeof value !== 'string' || !value)
            return res.status(400).send('Bad request');
        const userUid: string = res.locals.userUid;
        res.send(database.setOption(userUid, key, value));
    });

    return router;
}
