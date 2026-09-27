import type {
    LibraryCardDto,
    LibraryFilter,
    LibraryItemType,
    LibraryPageDto,
    LibrarySort,
} from '@nevu/contracts';
import axios from 'axios';
import { createHash } from 'crypto';
import express from 'express';
import http from 'http';
import https from 'https';

interface LibraryPageRouterOptions {
    plexServer: string;
    httpAgent?: http.Agent;
    httpsAgent?: https.Agent;
    maxConcurrentRequests?: number;
}

type JsonObject = Record<string, unknown>;

const filters = new Set<LibraryFilter>([
    'all', 'unwatched', 'watched', 'recentlyAdded', 'onDeck', 'newest',
]);
const itemTypes = new Set<LibraryItemType>(['movie', 'show', 'episode']);
const sorts = new Set<LibrarySort>([
    'title:asc',
    'title:desc',
    'addedAt:asc',
    'addedAt:desc',
    'year:asc',
    'year:desc',
    'updated:asc',
    'updated:desc',
    'random:desc',
]);
const typeNumbers: Record<LibraryItemType, number> = {
    movie: 1,
    show: 2,
    episode: 4,
};
const cardFields = [
    'ratingKey',
    'key',
    'guid',
    'type',
    'title',
    'parentTitle',
    'grandparentTitle',
    'parentRatingKey',
    'grandparentRatingKey',
    'parentIndex',
    'index',
    'year',
    'duration',
    'seasonCount',
    'childCount',
    'thumb',
    'art',
    'audienceRating',
    'rating',
    'viewCount',
    'viewOffset',
    'viewedLeafCount',
    'leafCount',
] as const;
const excludedFields = [
    'summary',
    'tagline',
    'originalTitle',
    'studio',
    'contentRating',
    'originallyAvailableAt',
    'ratingImage',
    'audienceRatingImage',
].join(',');
const excludedElements = [
    'Guid',
    'Country',
    'Director',
    'Writer',
    'Role',
    'Collection',
    'Label',
    'Producer',
    'Chapter',
    'Marker',
    'Extras',
    'Related',
    'Review',
    'Part',
].join(',');
const RANDOM_FETCH_SIZE = 500;
const RANDOM_CACHE_TTL_MS = 30 * 60 * 1000;
const RANDOM_CACHE_LIMIT = 8;

function pick(source: JsonObject, fields: readonly string[]) {
    return Object.fromEntries(
        fields
            .filter((field) => source[field] !== undefined)
            .map((field) => [field, source[field]]),
    );
}

function projectMedia(media: unknown) {
    if (!Array.isArray(media)) return undefined;
    return media
        .filter((entry): entry is JsonObject => Boolean(entry && typeof entry === 'object'))
        .map((entry) => pick(entry, [
            'bitrate',
            'height',
            'videoDynamicRange',
            'videoResolution',
            'width',
        ]));
}

function projectGenres(genres: unknown) {
    if (!Array.isArray(genres)) return undefined;
    return genres
        .filter((genre): genre is JsonObject => Boolean(genre && typeof genre === 'object'))
        .map((genre) => pick(genre, ['id', 'tag']))
        .filter((genre) => typeof genre.tag === 'string');
}

export function projectLibraryCards(metadata: unknown): LibraryCardDto[] {
    if (!Array.isArray(metadata)) return [];

    return metadata.flatMap((candidate) => {
        if (!candidate || typeof candidate !== 'object') return [];
        const item = candidate as JsonObject;
        if (
            typeof item.ratingKey !== 'string' ||
            typeof item.guid !== 'string' ||
            typeof item.type !== 'string' || !itemTypes.has(item.type as LibraryItemType) ||
            typeof item.title !== 'string'
        ) return [];

        const genres = projectGenres(item.Genre);
        const media = projectMedia(item.Media);
        return [{
            ...pick(item, cardFields),
            ...(genres && { Genre: genres }),
            ...(media && { Media: media }),
        } as LibraryCardDto];
    });
}

export function projectLibraryPage(
    container: unknown,
    requestedOffset = 0,
    requestedSize = 0,
): LibraryPageDto {
    const source = container && typeof container === 'object'
        ? container as JsonObject
        : {};
    const items = projectLibraryCards(source.Metadata);
    const offset = Number.isInteger(source.offset) ? Number(source.offset) : requestedOffset;
    const totalSize = Number.isInteger(source.totalSize) ? Number(source.totalSize) : null;

    return {
        offset,
        size: items.length,
        totalSize,
        hasMore: totalSize !== null
            ? offset + items.length < totalSize
            : requestedSize > 0 && items.length >= requestedSize,
        ...(typeof source.viewGroup === 'string' && { viewGroup: source.viewGroup }),
        ...(typeof source.title1 === 'string' && { title: source.title1 }),
        items,
    };
}

export class RequestLimiter {
    private active = 0;
    private readonly waiting: Array<() => void> = [];

    constructor(private readonly limit: number) {
        if (!Number.isInteger(limit) || limit < 1)
            throw new Error('Request limiter must allow at least one request');
    }

    async run<T>(operation: () => Promise<T>): Promise<T> {
        if (this.active >= this.limit)
            await new Promise<void>((resolve) => this.waiting.push(resolve));

        this.active += 1;
        try {
            return await operation();
        } finally {
            this.active -= 1;
            this.waiting.shift()?.();
        }
    }
}

function seededRandom(seed: string) {
    const digest = createHash('sha256').update(seed).digest();
    let state = digest.readUInt32LE(0) || 0x6d2b79f5;

    return () => {
        state += 0x6d2b79f5;
        let value = state;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
}

export function seededShuffle<T>(items: readonly T[], seed: string): T[] {
    const shuffled = [...items];
    const random = seededRandom(seed);
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
        const swapWith = Math.floor(random() * (index + 1));
        [shuffled[index], shuffled[swapWith]] = [shuffled[swapWith], shuffled[index]];
    }
    return shuffled;
}

interface ParsedRequest {
    sectionId: number;
    filter: LibraryFilter;
    type?: LibraryItemType;
    sort: LibrarySort;
    offset: number;
    size: number;
    seed?: string;
}

interface RandomSnapshot {
    items: LibraryCardDto[];
    lastUsed: number;
    viewGroup?: string;
    title?: string;
}

function single(value: unknown) {
    return typeof value === 'string' ? value : undefined;
}

function parseInteger(value: unknown) {
    const raw = single(value);
    if (!raw || !/^\d+$/.test(raw)) return null;
    const parsed = Number(raw);
    return Number.isSafeInteger(parsed) ? parsed : null;
}

function parseRequest(query: express.Request['query']): ParsedRequest | null {
    const sectionId = parseInteger(query.sectionId);
    const offset = parseInteger(query.offset);
    const size = parseInteger(query.size);
    const filter = single(query.filter) as LibraryFilter | undefined;
    const sort = single(query.sort) as LibrarySort | undefined;
    const type = single(query.type) as LibraryItemType | undefined;
    const seed = single(query.seed);

    if (
        sectionId === null || sectionId < 1 ||
        offset === null || offset < 0 ||
        size === null || size < 1 || size > 256 ||
        !filter || !filters.has(filter) ||
        !sort || !sorts.has(sort) ||
        (type && !itemTypes.has(type)) ||
        (sort === 'random:desc' && (!seed || !/^[a-zA-Z0-9_-]{1,64}$/.test(seed)))
    ) return null;

    return { sectionId, offset, size, filter, sort, ...(type && { type }), ...(seed && { seed }) };
}

function plexSort(sort: Exclude<LibrarySort, 'random:desc'>) {
    if (sort === 'updated:asc') return 'updatedAt:asc';
    if (sort === 'updated:desc') return 'updatedAt:desc';
    return sort;
}

function plexPath(request: Pick<ParsedRequest, 'sectionId' | 'filter'>) {
    const endpoint = request.filter === 'watched' ? 'all' : request.filter;
    return `/library/sections/${request.sectionId}/${endpoint}`;
}

function plexParams(
    request: Pick<ParsedRequest, 'filter' | 'type'>,
    sort: string,
    offset: number,
    size: number,
) {
    return {
        sort,
        ...(request.filter === 'watched' && {
            'show.unwatchedLeaves!': 1,
            'unwatched!': 1,
        }),
        ...(request.filter === 'all' && request.type && { type: typeNumbers[request.type] }),
        excludeFields: excludedFields,
        excludeElements: excludedElements,
        'X-Plex-Container-Start': offset,
        'X-Plex-Container-Size': size,
    };
}

function tokenCacheKey(token: string) {
    return createHash('sha256').update(token).digest('hex').slice(0, 24);
}

export function createLibraryPageRouter({
    plexServer,
    httpAgent,
    httpsAgent,
    maxConcurrentRequests = 4,
}: LibraryPageRouterOptions) {
    const router = express.Router();
    const limiter = new RequestLimiter(maxConcurrentRequests);
    const randomSnapshots = new Map<string, RandomSnapshot>();
    const pendingSnapshots = new Map<string, Promise<RandomSnapshot>>();

    const fetchContainer = async (
        token: string,
        request: ParsedRequest,
        sort: string,
        offset: number,
        size: number,
    ) => limiter.run(async () => {
        const response = await axios.get(`${plexServer}${plexPath(request)}`, {
            params: plexParams(request, sort, offset, size),
            headers: { Accept: 'application/json', 'X-Plex-Token': token },
            timeout: 20000,
            ...(httpAgent && { httpAgent }),
            ...(httpsAgent && { httpsAgent }),
        });
        return response.data?.MediaContainer;
    });

    const pruneSnapshots = () => {
        const now = Date.now();
        for (const [key, snapshot] of randomSnapshots)
            if (now - snapshot.lastUsed > RANDOM_CACHE_TTL_MS) randomSnapshots.delete(key);

        while (randomSnapshots.size > RANDOM_CACHE_LIMIT) {
            const oldest = [...randomSnapshots.entries()]
                .sort((left, right) => left[1].lastUsed - right[1].lastUsed)[0];
            if (!oldest) break;
            randomSnapshots.delete(oldest[0]);
        }
    };

    const getRandomSnapshot = async (
        token: string,
        request: ParsedRequest,
    ): Promise<RandomSnapshot> => {
        const cacheKey = [
            tokenCacheKey(token),
            request.sectionId,
            request.filter,
            request.type || 'any',
            request.seed,
        ].join(':');
        const cached = randomSnapshots.get(cacheKey);
        if (cached && Date.now() - cached.lastUsed <= RANDOM_CACHE_TTL_MS) {
            cached.lastUsed = Date.now();
            return cached;
        }

        const pending = pendingSnapshots.get(cacheKey);
        if (pending) return pending;

        const loading = (async () => {
            // PMS does not expose a stable, seeded random library order. Build one
            // snapshot per browser session so arbitrary ranges remain consistent.
            let offset = 0;
            let totalSize: number | null = null;
            let viewGroup: string | undefined;
            let title: string | undefined;
            const items: LibraryCardDto[] = [];

            do {
                const container = await fetchContainer(
                    token,
                    request,
                    'title:asc',
                    offset,
                    RANDOM_FETCH_SIZE,
                );
                const page = projectLibraryPage(container, offset, RANDOM_FETCH_SIZE);
                if (offset === 0) {
                    totalSize = page.totalSize;
                    viewGroup = page.viewGroup;
                    title = page.title;
                }
                items.push(...page.items);
                offset += page.items.length;
                if (!page.hasMore || page.items.length === 0) break;
            } while (totalSize === null || offset < totalSize);

            const snapshot = {
                items: seededShuffle(items, request.seed as string),
                lastUsed: Date.now(),
                ...(viewGroup && { viewGroup }),
                ...(title && { title }),
            };
            randomSnapshots.set(cacheKey, snapshot);
            pruneSnapshots();
            return snapshot;
        })();

        pendingSnapshots.set(cacheKey, loading);
        try {
            return await loading;
        } finally {
            pendingSnapshots.delete(cacheKey);
        }
    };

    router.get('/', async (req, res) => {
        const token = req.headers['x-plex-token'];
        const request = parseRequest(req.query);
        if (typeof token !== 'string' || !token)
            return res.status(401).send({ error: 'The active Plex session is missing' });
        if (!request)
            return res.status(400).send({ error: 'Invalid library range request' });

        res.set('Cache-Control', 'private, no-store');
        try {
            let page: LibraryPageDto;
            if (request.sort === 'random:desc') {
                const snapshot = await getRandomSnapshot(token, request);
                const items = snapshot.items.slice(request.offset, request.offset + request.size);
                page = {
                    offset: request.offset,
                    size: items.length,
                    totalSize: snapshot.items.length,
                    hasMore: request.offset + items.length < snapshot.items.length,
                    ...(snapshot.viewGroup && { viewGroup: snapshot.viewGroup }),
                    ...(snapshot.title && { title: snapshot.title }),
                    items,
                };
            } else {
                const container = await fetchContainer(
                    token,
                    request,
                    plexSort(request.sort),
                    request.offset,
                    request.size,
                );
                page = projectLibraryPage(container, request.offset, request.size);
            }
            res.send(page);
        } catch (error) {
            const upstreamStatus = axios.isAxiosError(error) ? error.response?.status : undefined;
            res.status(upstreamStatus && upstreamStatus < 500 ? upstreamStatus : 502).send({
                error: 'Unable to load the Plex library range',
                retryable: !upstreamStatus || upstreamStatus >= 500,
            });
        }
    });

    return router;
}
