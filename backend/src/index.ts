import axios, { AxiosRequestConfig } from 'axios';
import express from 'express';
import fs from 'fs';
import http from 'http';
import https from 'https';
import { Server as SocketIOServer } from 'socket.io';
import { PerPlexed } from './types';
import { randomBytes } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { CheckPlexUser } from './common/plex';
import { Discovery } from 'udp-discovery';
import httpProxy from 'http-proxy';
import { createPlexSharingRouter } from './plexSharing';
import { createPlexLibrariesRouter } from './plexLibraries';
import { APP_VERSION } from './appVersion';
import { createReviewsRouter } from './reviews';
import { createLibraryPageRouter } from './libraryPage';
import { safeRequestUrl, shouldLogRequest } from './requestLogging';

/* 
 * ENVIRONMENT VARIABLES
    * 
    * PORT: The port you published the docker container to, defaults to 3000 (For discovery)
    * LISTEN_PORT: The port the server will listen on, defaults to 3000
    * PLEX_SERVER: The URL of the Plex server that the frontend will connect to
    * TLS_CERT_PATH and TLS_KEY_PATH?: Enable HTTPS with the provided PEM files
    * DISABLE_TLS_VERIFY?: If set to true, the proxy will not check any https ssl certificates
    * DISABLE_NEVU_SYNC?: If set to true, NEVU sync (watch together) will be disabled
    * DISABLE_REQUEST_LOGGING?: If set to true, the server will not log any requests
    * DISABLE_GLOBAL_REVIEWS?: If set to true, nevu community reviews will be disabled
**/
const deploymentID = randomBytes(8).toString('hex');

const status: PerPlexed.Status = {
    ready: false,
    error: false,
    message: 'Server is starting up...',
}

const app = express();
const prisma = new PrismaClient();
const discovery = new Discovery();

console.log(`Deployment ID: ${deploymentID}`);

discovery.announce("Nevu", {
    port: parseInt(process.env.PORT || '3000'),
    type: 'nevu',
    protocol: 'tcp',
    txt: {
        deploymentID,
        version: APP_VERSION,
        plexServer: process.env.PLEX_SERVER,
    }
}, 500, true);

const plexServerUrl = new URL(process.env.PLEX_SERVER || 'http://localhost:32400');
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
const plexProxyAgent = plexServerUrl.protocol === 'https:'
    ? plexHttpsAgent
    : plexHttpAgent;

const proxy = httpProxy.createProxyServer({
    ws: true,
    autoRewrite: false,
    cookieDomainRewrite: (new URL(process.env.PLEX_SERVER || "http://localhost:32400")).hostname,
    changeOrigin: true,
    secure: process.env.DISABLE_TLS_VERIFY !== 'true',
    followRedirects: true,
    agent: plexProxyAgent,
});

proxy.on('error', (err, req, res) => {
    console.error('Proxy error:', err);
});

app.use(express.json());

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
    if (process.env.PROXY_PLEX_SERVER) {
        status.error = true;
        status.message = 'PROXY_PLEX_SERVER environment variable is deprecated. \nPlease use PLEX_SERVER instead';
        console.error('PROXY_PLEX_SERVER environment variable is deprecated. \nPlease use PLEX_SERVER instead');
        return;
    }

    if (process.env.DISABLE_PROXY) {
        status.error = true;
        status.message = 'DISABLE_PROXY environment variable is deprecated. \nPlease remove it from your environment variables';
        console.error('DISABLE_PROXY environment variable is deprecated. \nPlease remove it from your environment variables');
        return;
    }

    if (!process.env.PLEX_SERVER) {
        status.error = true;
        status.message = 'PLEX_SERVER environment variable not set';
        console.error('PLEX_SERVER environment variable not set');
        return;
    }

    if (process.env.PLEX_SERVER) {
        // check if the PLEX_SERVER environment variable is a valid URL, the URL must not end with a /
        if (!process.env.PLEX_SERVER.match(/^https?:\/\/[^\/]+$/)) {
            status.error = true;
            status.message = 'Invalid PLEX_SERVER environment variable. \nThe URL must start with http:// or https:// and must not end with a /';
            console.error('Invalid PLEX_SERVER environment variable. \nThe URL must start with http:// or https:// and must not end with a /');
            return;
        }

        // check whether the PLEX_SERVER is reachable
        await new Promise<void>(async (resolve) => {
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
                    return resolve();
                } else {
                    status.error = true;
                    status.message = 'Proxy cannot reach PLEX_SERVER';
                    console.error('Proxy cannot reach PLEX_SERVER');
                    await new Promise(r => setTimeout(r, 3000));
                }
            }
        })
    }


    // if(!status.error) {
    //     let checkAllows = false;
    //     const fetchStatus = async () => {
    //         try {
    //             const res = await axios.get(`${process.env.PLEX_SERVER}/`, {
    //                 timeout: 2500,
    //             });

    //             const m = res.data.MediaContainer;

    //             if(
    //                 !m.transcoderAudio ||
    //                 !m.transcoderSubtitles ||
    //                 !m.transcoderVideo
    //             ) {
    //                 status.error = true;
    //                 status.message = `PLEX_SERVER ${m.friendlyName} does not allow transcoding`;
    //                 console.error(`PLEX_SERVER ${m.friendlyName} does not allow transcoding`);
    //                 return;
    //             }

    //             checkAllows = true;
    //             status.error = false;

    //         } catch (error: any) {
    //             status.error = true;
    //             status.message = 'Server cannot reach PLEX_SERVER' + error.message;
    //             console.error('Server cannot reach PLEX_SERVER ' + error.message);
    //         }
    //     }

    //     await new Promise<void>((resolve) => {
    //         setTimeout(() => {
    //             if(checkAllows) return resolve();
    //             fetchStatus();
    //         }, 5000);
    //     })
    // }


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
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
    res.header('Access-Control-Allow-Headers', '*'); // Add this line
    next();
});

app.get('/status', (req, res) => {
    res.send(status);
});

app.get('/config', (req, res) => {
    res.send({
        PLEX_SERVER: process.env.PLEX_SERVER,
        DEPLOYMENTID: deploymentID,
        CONFIG: {
            DISABLE_PROXY: process.env.DISABLE_PROXY === 'true',
            DISABLE_NEVU_SYNC: process.env.DISABLE_NEVU_SYNC === 'true',
            DISABLE_GLOBAL_REVIEWS: process.env.DISABLE_GLOBAL_REVIEWS === 'true',
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

app.use('/library-page', createLibraryPageRouter({
    plexServer: process.env.PLEX_SERVER || 'http://localhost:32400',
    httpAgent: plexHttpAgent,
    httpsAgent: plexHttpsAgent,
}));

app.use('/reviews', createReviewsRouter({
    prisma,
    globalReviewsEnabled: process.env.DISABLE_GLOBAL_REVIEWS !== 'true',
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

app.get('/user/options', async (req, res) => {
    if (!req.headers['x-plex-token']) return res.status(401).send('Unauthorized');

    const user = await CheckPlexUser(req.headers['x-plex-token'] as string);
    if (!user) return res.status(401).send('Unauthorized user');

    const options = await prisma.userOption.findMany({
        where: {
            userUid: user.uuid,
        }
    }).catch((err) => {
        res.status(500).send('Internal server error');
        console.log(err);
        return null;
    });
    if (!options) return;

    res.send(options);
});

app.get('/user/options/:key', async (req, res) => {
    if (!req.headers['x-plex-token']) return res.status(401).send('Unauthorized');

    const user = await CheckPlexUser(req.headers['x-plex-token'] as string);
    if (!user) return res.status(401).send('Unauthorized user');

    const { key } = req.params;
    if (!key) return res.status(400).send('Bad request');

    const option = await prisma.userOption.findFirst({
        where: {
            userUid: user.uuid,
            key,
        }
    }).catch((err) => {
        res.status(500).send('Internal server error');
        console.log(err);
        return null;
    });
    if (!option) return res.status(404).send('Option not found');
    res.send(option);
});


app.post('/user/options', async (req, res) => {
    if (!req.headers['x-plex-token']) return res.status(401).send('Unauthorized');

    const user = await CheckPlexUser(req.headers['x-plex-token'] as string);
    if (!user) return res.status(401).send('Unauthorized user');

    const { key, value } = req.body;

    if (!key || !value) return res.status(400).send('Bad request');

    const option = await prisma.userOption.upsert({
        where: {
            userUid_key: {
                userUid: user.uuid,
                key,
            }
        },
        update: {
            value,
        },
        create: {
            userUid: user.uuid,
            key,
            value,
        }
    }).catch((err) => {
        res.status(500).send('Internal server error');
        console.log(err);
        return null;
    });
    if (!option) return;

    res.send(option);
});

app.use('/dynproxy/*', (req, res) => {
    const url = req.originalUrl.split('/dynproxy')[1];
    if (!url) return res.status(400).send('Bad request');

    // strip cookies from the request
    req.headers.cookie = '';
    req.headers['x-forwarded-for'] = ((req.headers['x-forwarded-for'] || req.socket.remoteAddress || '') as string).replace("::ffff:", "");

    proxy.web(req, res, { target: `${process.env.PLEX_SERVER}${url}` }, (err) => {
        console.error('Proxy error:', err);
        res.status(500).send('Proxy error');
    });
});

app.post('/proxy', (req, res) => {
    const { url, method, headers, data } = req.body;
    const ip = ((req.headers['x-forwarded-for'] || req.socket.remoteAddress || '') as string).replace("::ffff:", "");

    // the url must start with a / to prevent the server from making requests to external servers
    if (!url || !url.startsWith('/')) return res.status(400).send('Invalid URL');

    // check that the url doesn't include any harmful characters that could be used for directory traversal
    if (url.match(/\.\./)) return res.status(400).send('Invalid URL');

    // the method must be one of the allowed methods [GET, POST, PUT]
    if (!method || !['GET', 'POST', 'PUT'].includes(method)) return res.status(400).send('Invalid method');

    if (process.env.DISABLE_REQUEST_LOGGING != "true") {
        console.log(
            `[${new Date().toISOString()}] [PROXY] [${method}] ${safeRequestUrl(url)} from ${ip}`
        );
    }

    const config: AxiosRequestConfig = {
        url: `${process.env.PLEX_SERVER}${url}`,
        method,
        headers: {
            ...headers,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0',
            'X-Forwarded-For': ip,
        },
        data,
        httpAgent: plexHttpAgent,
        httpsAgent: plexHttpsAgent,
    };

    axios(config)
        .then((response) => {
            res.set('Content-Type', response.headers['content-type'] as string);
            res.set('Content-Length', response.headers['content-length'] as string);
            // res.set('Cache-Control', 'public, max-age=31536000');
            res.status(response.status).send(response.data);
        })
        .catch((error) => {
            res.status(error.response?.status || 500).send(error.response?.data || 'Proxy error');
        });
});

app.get('/proxy', async (req, res) => {
    const { url, method, ...params } = req.query;
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    // the url must start with a / to prevent the server from making requests to external servers
    if (!url || typeof url !== "string" || !url.startsWith('/')) return res.status(400).send('Invalid URL');

    // check that the url doesn't include any harmful characters that could be used for directory traversal
    if (url.match(/\.\./)) return res.status(400).send('Invalid URL');

    // the method must be one of the allowed methods [GET, POST, PUT]
    if (!method || typeof method !== "string" || !['GET', 'POST', 'PUT'].includes(method)) return res.status(400).send('Invalid method');

    // remove url and method from params
    const { url: _, method: __, ...queryParams } = req.query;

    const config: AxiosRequestConfig = {
        url: `${process.env.PLEX_SERVER}${url}`,
        method,
        headers: {
            ...req.headers,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0',
            'X-Fowarded-For': ip,
        },
        params: queryParams,
        httpAgent: plexHttpAgent,
        httpsAgent: plexHttpsAgent,
        responseType: 'stream'
    };

    axios(config).then((response) => {
        res.set('Content-Type', response.headers['content-type'] as string);
        res.set('Content-Length', response.headers['content-length'] as string);
        // res.set('Cache-Control', 'public, max-age=31536000');
        response.data.pipe(res);
    }).catch((error) => {
        res.status(error.response?.status || 500).send(error.response?.data || 'Proxy error');
    });
});

app.options('*', (req, res) => {
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
    res.header('Access-Control-Allow-Headers', '*');
    res.send();
});

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

let io = (process.env.DISABLE_NEVU_SYNC === 'true') ? null : new SocketIOServer(server, {
    cors: {
        origin: '*',
    },
    connectionStateRecovery: {
        maxDisconnectionDuration: 10000, // 10 seconds
    }
});

let remoteIo = new SocketIOServer(server, {
    cors: {
        origin: '*',
    },
    path: '/nevu-remote',
    connectionStateRecovery: {
        maxDisconnectionDuration: 10000, // 10 seconds
        skipMiddlewares: false, // Skip middlewares for remote connections
    },
});


app.use((req, res, next) => {
    if (req.url.startsWith('/socket.io')) return next();
    res.sendFile('index.html', { root: 'www' });
});

export { app, server, io, remoteIo, deploymentID, prisma };

import './common/sync';
import './common/remote'; import { error } from 'console';
