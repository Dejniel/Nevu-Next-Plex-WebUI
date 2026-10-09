import axios from 'axios';
import express from 'express';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import { Server as SocketIOServer } from 'socket.io';
import type { PerPlexed } from './types.js';
import { randomBytes } from 'node:crypto';
import { createDatabase } from './database.js';
import { registerSync } from './common/sync.js';
import { registerRemote } from './common/remote.js';
import { createPlexSharingRouter } from './plexSharing.js';
import { createPlexLibrariesRouter } from './plexLibraries.js';
import { createPlexPreferencesRouter } from './plexPreferences.js';
import { APP_VERSION } from './appVersion.js';
import { createLibraryPageRouter } from './libraryPage.js';
import { safeRequestUrl, shouldLogRequest } from './requestLogging.js';
import { parsePlexServerUrl } from './plexServerUrl.js';
import { createPlexProxyRouter } from './plexProxy.js';
import { createUserOptionsRouter } from './userOptions.js';
import { httpErrorHandler } from './httpErrors.js';

/*
 * ENVIRONMENT VARIABLES
    *
    * LISTEN_PORT: The port the server will listen on, defaults to 3000
    * PLEX_SERVER: The URL of the Plex server that the frontend will connect to
    * TLS_CERT_PATH and TLS_KEY_PATH?: Enable HTTPS with the provided PEM files
    * DISABLE_TLS_VERIFY?: If set to true, the proxy will not check any https ssl certificates
    * DISABLE_NEVU_SYNC?: If set to true, NEVU sync (watch together) will be disabled
    * DISABLE_REQUEST_LOGGING?: If set to true, the server will not log any requests
**/
const deploymentID = randomBytes(8).toString('hex');

const status: PerPlexed.Status = {
    ready: false,
    error: false,
    message: 'Server is starting up...',
}

const app = express();
const database = createDatabase();

console.log(`Deployment ID: ${deploymentID}`);

const configuredPlexServerUrl = parsePlexServerUrl(process.env.PLEX_SERVER);
const plexServerUrl = configuredPlexServerUrl ?? new URL('http://localhost:32400');
const keepAliveOptions = {
    keepAlive: true,
    keepAliveMsecs: 1000,
    maxFreeSockets: 16,
    maxSockets: 64,
};
const plexHttpAgent = new http.Agent(keepAliveOptions);
const verifiedHttpsAgent = new https.Agent(keepAliveOptions);
const noVerifyHttpsAgent = new https.Agent({
    ...keepAliveOptions,
    rejectUnauthorized: false,
});
const plexHttpsAgent = process.env.DISABLE_TLS_VERIFY === 'true'
    ? noVerifyHttpsAgent
    : verifiedHttpsAgent;
// Long-lived notification streams must not occupy the HTTP request pool.
const plexEventAgent = plexServerUrl.protocol === 'https:'
    ? new https.Agent({ rejectUnauthorized: process.env.DISABLE_TLS_VERIFY !== 'true' })
    : new http.Agent();

const PLEX_DISCOVER_URL = 'https://discover.provider.plex.tv';
const discoverExtrasPath = /^\/library\/metadata\/[a-f0-9]+\/extras$/i;
const discoverStreamPath = /^\/library\/metadata\/[a-f0-9]+\/extras\/[a-f0-9]+\/parts\/hls\.m3u8$/i;

function getDiscoverHeaders(req: express.Request) {
    const token = req.headers['x-plex-token'];
    if (typeof token !== 'string' || !token) return null;

    return {
        'Accept': 'application/json',
        'X-Plex-Token': token,
        'X-Plex-Product': 'NEVU',
        'X-Plex-Version': APP_VERSION,
        'X-Plex-Client-Identifier': String(
            req.headers['x-plex-client-identifier'] || 'nevu-web'
        ),
    };
}

(async () => {
    if (!process.env.PLEX_SERVER) {
        status.error = true;
        status.message = 'PLEX_SERVER environment variable not set';
        console.error('PLEX_SERVER environment variable not set');
        return;
    }

    if (process.env.PLEX_SERVER) {
        // check if the PLEX_SERVER environment variable is a valid URL, the URL must not end with a /
        if (!configuredPlexServerUrl) {
            status.error = true;
            status.message = 'Invalid PLEX_SERVER environment variable. \nThe URL must start with http:// or https:// and must not end with a /';
            console.error('Invalid PLEX_SERVER environment variable. \nThe URL must start with http:// or https:// and must not end with a /');
            return;
        }

        // check whether the PLEX_SERVER is reachable
        while (true) {
            const r = await axios.get(`${process.env.PLEX_SERVER ?? "http://localhost:32400"}/identity`, {
                timeout: 5000,
                httpAgent: plexHttpAgent,
                httpsAgent: plexHttpsAgent,
            }).catch((e) => {
                console.error('Error reaching PLEX_SERVER:', e.message);
                return null;
            });
            if (r && r.status === 200) {
                status.error = false;
                break;
            } else {
                status.error = true;
                status.message = 'Proxy cannot reach PLEX_SERVER';
                console.error('Proxy cannot reach PLEX_SERVER');
                await new Promise(r => setTimeout(r, 3000));
            }
        }
    }


    if (status.error) return;
    status.ready = true;
    status.message = 'OK';
})();

app.use((req, res, next) => {
    if (
        process.env.DISABLE_REQUEST_LOGGING !== 'true' &&
        shouldLogRequest(req.path)
    ) {
        console.log(
            `[${new Date().toISOString()}] [${req.method}] ${safeRequestUrl(req.originalUrl)}`,
        );
    }
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, HEAD, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', '*');
    next();
});

app.options('/{*path}', (_req, res) => {
    res.sendStatus(204);
});

app.use(createPlexProxyRouter({
    plexServer: plexServerUrl.origin,
    httpAgent: plexHttpAgent,
    httpsAgent: plexHttpsAgent,
    eventAgent: plexEventAgent,
}));
app.use(express.json());

app.get('/status', (_req, res) => {
    res.send(status);
});

app.get('/config', (_req, res) => {
    res.send({
        PLEX_SERVER: process.env.PLEX_SERVER,
        DEPLOYMENTID: deploymentID,
        CONFIG: {
            DISABLE_NEVU_SYNC: process.env.DISABLE_NEVU_SYNC === 'true',
        }
    });
});

app.use('/sharing', createPlexSharingRouter({
    plexServer: process.env.PLEX_SERVER || 'http://localhost:32400',
    httpsAgent: plexHttpsAgent,
}));

app.use('/libraries', createPlexLibrariesRouter({
    plexServer: process.env.PLEX_SERVER || 'http://localhost:32400',
    httpsAgent: plexHttpsAgent,
}));
app.use('/server-preferences', createPlexPreferencesRouter({
    plexServer: plexServerUrl.origin,
    httpsAgent: plexHttpsAgent,
}));

app.use('/library-page', createLibraryPageRouter({
    plexServer: process.env.PLEX_SERVER || 'http://localhost:32400',
    httpAgent: plexHttpAgent,
    httpsAgent: plexHttpsAgent,
}));

app.post('/discover/extras', async (req, res) => {
    const headers = getDiscoverHeaders(req);
    if (!headers) return res.status(401).send('Unauthorized');

    const path = req.body?.path;
    if (typeof path !== 'string' || !discoverExtrasPath.test(path))
        return res.status(400).send('Invalid Discover extras path');

    try {
        const response = await axios.get(`${PLEX_DISCOVER_URL}${path}`, {
            headers,
            timeout: 10000,
        });
        res.status(response.status).send(response.data);
    } catch (error: any) {
        res.status(error.response?.status || 502).send(
            error.response?.data || 'Plex Discover request failed'
        );
    }
});

app.post('/discover/stream', async (req, res) => {
    const headers = getDiscoverHeaders(req);
    if (!headers) return res.status(401).send('Unauthorized');

    const path = req.body?.path;
    if (typeof path !== 'string' || !discoverStreamPath.test(path))
        return res.status(400).send('Invalid Discover stream path');

    try {
        const response = await axios.get(`${PLEX_DISCOVER_URL}${path}`, {
            headers,
            maxRedirects: 0,
            timeout: 10000,
            validateStatus: (code) => code >= 300 && code < 400,
        });
        const location = response.headers.location;
        if (typeof location !== 'string' || new URL(location).protocol !== 'https:')
            return res.status(502).send('Plex Discover did not return a stream');

        res.send({ url: location });
    } catch (error: any) {
        res.status(error.response?.status || 502).send(
            error.response?.data || 'Plex Discover stream request failed'
        );
    }
});

app.use('/user/options', createUserOptionsRouter({ database }));

app.use(express.static('www'));

const listenPort = process.env.LISTEN_PORT || '3000';
const tlsCertPath = process.env.TLS_CERT_PATH?.trim();
const tlsKeyPath = process.env.TLS_KEY_PATH?.trim();

if (Boolean(tlsCertPath) !== Boolean(tlsKeyPath)) {
    throw new Error('TLS_CERT_PATH and TLS_KEY_PATH must be configured together');
}

const usesTls = Boolean(tlsCertPath && tlsKeyPath);
const server = usesTls
    ? https.createServer({
        cert: fs.readFileSync(tlsCertPath as string),
        key: fs.readFileSync(tlsKeyPath as string),
        ...(process.env.TLS_KEY_PASSPHRASE && {
            passphrase: process.env.TLS_KEY_PASSPHRASE,
        }),
    }, app)
    : http.createServer(app);

server.listen(listenPort, () => {
    console.log(`Server started on ${usesTls ? 'https' : 'http'}://localhost:${listenPort}`);
});

const io = (process.env.DISABLE_NEVU_SYNC === 'true') ? null : new SocketIOServer(server, {
    cors: {
        origin: '*',
    },
    connectionStateRecovery: {
        maxDisconnectionDuration: 10000, // 10 seconds
    }
});

const remoteIo = new SocketIOServer(server, {
    cors: {
        origin: '*',
    },
    path: '/nevu-remote',
    connectionStateRecovery: {
        maxDisconnectionDuration: 10000, // 10 seconds
        skipMiddlewares: false, // Skip middlewares for remote connections
    },
});


app.get('/{*path}', (_req, res) => {
    res.sendFile('index.html', { root: 'www' });
});
app.use(httpErrorHandler);

registerSync(io);
registerRemote(remoteIo);

let shuttingDown = false;
async function shutdown() {
    if (shuttingDown) return;
    shuttingDown = true;
    status.ready = false;
    setTimeout(() => process.exit(1), 10000).unref();
    const closed = new Promise<void>(resolve => server.close(() => resolve()));
    // SSE and media streams can outlive the shutdown grace period.
    const drainTimeout = setTimeout(() => server.closeAllConnections(), 5000).unref();
    io?.close();
    remoteIo.close();
    await closed;
    clearTimeout(drainTimeout);
    plexHttpAgent.destroy();
    verifiedHttpsAgent.destroy();
    noVerifyHttpsAgent.destroy();
    plexEventAgent.destroy();
    database.close();
    process.exit(0);
}
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => {
        shutdown().catch(() => {
            console.error('Could not shut down the server cleanly');
            process.exit(1);
        });
    });
}
