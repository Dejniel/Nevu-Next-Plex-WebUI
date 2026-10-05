import axios from 'axios';
import type { AxiosRequestConfig } from 'axios';
import express from 'express';
import type http from 'node:http';
import type https from 'node:https';
import { pipeline } from 'node:stream/promises';
import { safeRequestUrl } from './requestLogging.js';

interface PlexProxyOptions {
    plexServer: string;
    httpAgent: http.Agent;
    httpsAgent: https.Agent;
    eventAgent: http.Agent;
}

const hopHeaders = new Set([
    'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
    'te', 'trailer', 'transfer-encoding', 'upgrade',
]);

function forwardedHeaders(headers: Record<string, unknown>) {
    const normalized = Object.fromEntries(
        Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value]),
    );
    const omitted = new Set(hopHeaders);
    if (typeof normalized.connection === 'string')
        for (const name of normalized.connection.split(',')) omitted.add(name.trim().toLowerCase());
    const result: Record<string, string | string[]> = {};
    for (const [name, value] of Object.entries(normalized)) {
        if (omitted.has(name)) continue;
        if (typeof value === 'string' || (Array.isArray(value) && value.every((part) => typeof part === 'string')))
            result[name] = value;
    }
    return result;
}

function clientAddress(req: express.Request) {
    const forwarded = req.headers['x-forwarded-for'];
    return (typeof forwarded === 'string' ? forwarded : req.socket.remoteAddress || '')
        .replace('::ffff:', '');
}

function validPath(value: unknown): value is string {
    return typeof value === 'string' && value.startsWith('/') && !value.includes('..');
}

function validMethod(value: unknown): value is 'GET' | 'POST' | 'PUT' {
    return typeof value === 'string' && ['GET', 'POST', 'PUT'].includes(value);
}

export function createPlexProxyRouter({
    plexServer, httpAgent, httpsAgent, eventAgent,
}: PlexProxyOptions) {
    const router = express.Router();

    async function forward(
        req: express.Request,
        res: express.Response,
        config: AxiosRequestConfig,
        streaming: boolean,
    ) {
        const controller = new AbortController();
        const abort = () => controller.abort();
        req.once('aborted', abort);
        res.once('close', abort);
        try {
            const response = await axios({
                httpAgent,
                httpsAgent,
                validateStatus: () => true,
                ...config,
                signal: controller.signal,
                responseType: streaming ? 'stream' : 'arraybuffer',
                ...(streaming && { decompress: false }),
            });
            res.status(response.status);
            if (streaming) {
                for (const [name, value] of Object.entries(forwardedHeaders(response.headers)))
                    res.setHeader(name, value);
                res.flushHeaders();
                await pipeline(response.data, res);
            } else {
                const contentType = response.headers['content-type'];
                if (typeof contentType === 'string') res.type(contentType);
                res.send(response.data);
            }
        } catch (error) {
            if (res.destroyed || controller.signal.aborted) return;
            if (!axios.isAxiosError(error)) throw error;
            res.status(502).send('Plex proxy request failed');
        } finally {
            req.off('aborted', abort);
            res.off('close', abort);
        }
    }

    // Mounting removes only the prefix and preserves the raw Plex path/query.
    // Keep JSON parsing off this route so request bodies remain streamable.
    router.use('/dynproxy', async (req, res) => {
        const headers = forwardedHeaders(req.headers);
        delete headers.host;
        delete headers.cookie;
        headers['x-forwarded-for'] = clientAddress(req);
        const events = req.path === '/:/eventsource/notifications';
        await forward(req, res, {
            url: `${plexServer}${req.url}`,
            method: req.method,
            headers,
            data: ['GET', 'HEAD'].includes(req.method) ? undefined : req,
            ...(events && { httpAgent: eventAgent, httpsAgent: eventAgent }),
        }, true);
    });

    router.post('/proxy', express.json(), async (req, res) => {
        const { url, method, headers, data } = req.body ?? {};
        if (!validPath(url)) return res.status(400).send('Invalid URL');
        if (!validMethod(method)) return res.status(400).send('Invalid method');
        if (headers !== undefined && (!headers || typeof headers !== 'object' || Array.isArray(headers)))
            return res.status(400).send('Invalid headers');

        const ip = clientAddress(req);
        if (process.env.DISABLE_REQUEST_LOGGING !== 'true')
            console.log(`[${new Date().toISOString()}] [PROXY] [${method}] ${safeRequestUrl(url)} from ${ip}`);

        const outgoing = forwardedHeaders(headers ?? {});
        delete outgoing.host;
        delete outgoing.cookie;
        delete outgoing['content-length'];
        await forward(req, res, {
            url: `${plexServer}${url}`,
            method,
            headers: {
                ...outgoing,
                Accept: 'application/json',
                'Content-Type': 'application/json',
                'X-Forwarded-For': ip,
            },
            data,
        }, false);
    });

    router.get('/proxy', async (req, res) => {
        const { url, method } = req.query;
        if (!validPath(url)) return res.status(400).send('Invalid URL');
        if (!validMethod(method)) return res.status(400).send('Invalid method');

        const query = new URL(req.originalUrl, 'http://localhost').searchParams;
        query.delete('url');
        query.delete('method');
        const target = new URL(`${plexServer}${url}`);
        for (const [name, value] of query) target.searchParams.append(name, value);
        const headers = forwardedHeaders(req.headers);
        delete headers.host;
        delete headers.cookie;
        delete headers['content-length'];
        headers['x-forwarded-for'] = clientAddress(req);
        await forward(req, res, { url: target.href, method, headers }, true);
    });

    return router;
}
