import type {
    LibraryCardDto,
    LibraryFilterExpression,
    LibraryFilterGroup,
    LibraryFilterLeaf,
    LibraryFilterMode,
    LibraryFilterOperator,
    LibraryItemType,
    LibraryPageDto,
    LibrarySource,
    LibrarySort,
} from '@nevu/contracts';
import { changedLibraryFields, libraryFilterUnaffected, mediaMetadataIncludes } from '@nevu/contracts';
import axios from 'axios';
import { createHash } from 'node:crypto';
import express from 'express';
import http from 'node:http';
import https from 'node:https';

interface LibraryPageRouterOptions {
    plexServer: string;
    httpAgent?: http.Agent;
    httpsAgent?: https.Agent;
    maxConcurrentRequests?: number;
}

type JsonObject = Record<string, unknown>;

const itemTypes = new Set<LibraryItemType>(['movie', 'show', 'episode']);
const librarySources = new Set<LibrarySource>(['all', 'onDeck']);
const filterModes = new Set<LibraryFilterMode>(['and', 'or']);
const filterOperators = new Set<LibraryFilterOperator>([
    '=', '!=', '==', '!==', '<=', '>=', '<<=', '>>=',
]);
const plexFilterFieldExpression = /^[A-Za-z][A-Za-z0-9_.]{0,95}$/;
const plexSortExpression = /^[A-Za-z][A-Za-z0-9_.]*(?::(?:asc|desc|nullsFirst|nullsLast))?(?:,[A-Za-z][A-Za-z0-9_.]*(?::(?:asc|desc|nullsFirst|nullsLast))?)*$/;
const MAX_FILTER_CONDITIONS = 32;
const MAX_FILTER_NODES = 64;
const MAX_FILTER_DEPTH = 4;
const MAX_FILTER_EXPRESSION_LENGTH = 16384;
const MAX_FILTER_VALUE_LENGTH = 256;
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
    'titleSort', 'librarySectionID', 'addedAt', 'updatedAt', 'lastViewedAt',
    'originallyAvailableAt', 'studio', 'contentRating', 'userRating',
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
    'ratingImage',
    'audienceRatingImage',
].join(',');
const excludedElements = [
    'Guid',
    'Country',
    'Director',
    'Writer',
    'Role',
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
const RANDOM_CATALOG_TTL_MS = 30 * 60 * 1000;
const RANDOM_CATALOG_LIMIT = 8;
const RANDOM_ORDER_LIMIT = 16;

export class InvalidLibraryPageError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'InvalidLibraryPageError';
    }
}

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

function projectLibraryCards(metadata: unknown): LibraryCardDto[] {
    if (metadata === undefined) return [];
    if (!Array.isArray(metadata))
        throw new InvalidLibraryPageError('Library metadata is not an array');

    return metadata.map((candidate, index) => {
        if (!candidate || typeof candidate !== 'object')
            throw new InvalidLibraryPageError(`Invalid library item at index ${index}`);
        const item = candidate as JsonObject;
        if (
            typeof item.ratingKey !== 'string' ||
            typeof item.guid !== 'string' ||
            typeof item.type !== 'string' || !itemTypes.has(item.type as LibraryItemType) ||
            typeof item.title !== 'string'
        ) throw new InvalidLibraryPageError(`Incomplete library item at index ${index}`);

        const genres = projectGenres(item.Genre);
        const media = projectMedia(item.Media);
        const collections = projectGenres(item.Collection);
        return {
            ...pick(item, cardFields),
            ...(genres && { Genre: genres }),
            ...(collections && { Collection: collections }),
            ...(media && { Media: media }),
        } as LibraryCardDto;
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
    const items = projectLibraryCards(source.Metadata).map(item => ({
        ...item,
        ...(item.librarySectionID === undefined && source.librarySectionID !== undefined && {
            librarySectionID: Number(source.librarySectionID),
        }),
    }));
    const offset = Number.isInteger(source.offset) ? Number(source.offset) : requestedOffset;
    const totalSize = Number.isInteger(source.totalSize) ? Number(source.totalSize) : null;
    const reportedSize = Number.isInteger(source.size) ? Number(source.size) : items.length;

    if (
        reportedSize !== items.length ||
        (totalSize !== null && (offset + items.length > totalSize ||
            (items.length === 0 && offset < totalSize)))
    ) throw new InvalidLibraryPageError('Plex returned an inconsistent library page');

    return {
        offset,
        size: items.length,
        totalSize,
        hasMore: totalSize !== null
            ? offset + items.length < totalSize
            : requestedSize > 0 && items.length >= requestedSize,
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

export function stableRandomOrder<T extends { ratingKey: string }>(
    items: readonly T[],
    seed: string,
): T[] {
    return items
        .map((item) => ({
            item,
            rank: createHash('sha256')
                .update(seed)
                .update('\0')
                .update(item.ratingKey)
                .digest('hex'),
        }))
        .sort((left, right) => {
            if (left.rank !== right.rank) return left.rank < right.rank ? -1 : 1;
            if (left.item.ratingKey === right.item.ratingKey) return 0;
            return left.item.ratingKey < right.item.ratingKey ? -1 : 1;
        })
        .map(({ item }) => item);
}

interface ParsedRequest {
    sectionId: number;
    source: LibrarySource;
    type?: LibraryItemType;
    sort: LibrarySort;
    filterExpression?: LibraryFilterExpression;
    offset: number;
    size: number;
    seed?: string;
}

interface RandomCatalog {
    request: ParsedRequest;
    items: LibraryCardDto[];
    generationId: string;
    loadedAt: number;
    lastUsed: number;
}

interface RandomOrder {
    items: LibraryCardDto[];
    lastUsed: number;
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

function isValidPlexSort(value: string | undefined): value is LibrarySort {
    return Boolean(value && value.length <= 512 && plexSortExpression.test(value));
}

function isRandomSort(value: LibrarySort) {
    return value === 'random' || value === 'random:desc';
}

function normalizedFilterExpression(
    expression: LibraryFilterExpression,
): LibraryFilterExpression {
    if (expression.kind === 'clause') return expression;

    const normalized = expression.children.flatMap((child) => {
        const next = normalizedFilterExpression(child);
        return next.kind === 'group' && next.mode === expression.mode
            ? next.children
            : [next];
    });
    const unique = new Map(normalized.map((child) => [JSON.stringify(child), child]));
    const children = [...unique.values()].sort((left, right) => {
        const leftKey = JSON.stringify(left);
        const rightKey = JSON.stringify(right);
        return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
    });
    if (children.length === 1) return children[0];
    return { kind: 'group', mode: expression.mode, children };
}

function parseFilterExpression(value: unknown): LibraryFilterExpression | null | undefined {
    if (value === undefined) return undefined;
    const serialized = single(value);
    if (!serialized || serialized.length > MAX_FILTER_EXPRESSION_LENGTH) return null;

    try {
        const parsed = JSON.parse(serialized) as unknown;
        let conditions = 0;
        let nodes = 0;

        const parseNode = (candidate: unknown, depth: number): LibraryFilterExpression => {
            if (!candidate || typeof candidate !== 'object')
                throw new InvalidLibraryPageError('Invalid filter');
            const source = candidate as Record<string, unknown>;
            nodes += 1;
            if (nodes > MAX_FILTER_NODES || depth > MAX_FILTER_DEPTH)
                throw new InvalidLibraryPageError('Filter expression is too complex');

            if (source.kind === 'clause') {
                conditions += 1;
                const field = source.field;
                const operator = source.operator;
                const filterValue = source.value;
                if (
                    conditions > MAX_FILTER_CONDITIONS ||
                    typeof field !== 'string' || !plexFilterFieldExpression.test(field) ||
                    typeof operator !== 'string' ||
                        !filterOperators.has(operator as LibraryFilterOperator) ||
                    typeof filterValue !== 'string' || !filterValue.trim() ||
                    filterValue.length > MAX_FILTER_VALUE_LENGTH ||
                        // Filter values must reject C0 controls and DEL before URL encoding.
                        // oxlint-disable-next-line no-control-regex
                        /[\u0000-\u001f\u007f]/.test(filterValue)
                ) throw new InvalidLibraryPageError('Invalid filter condition');
                return {
                    kind: 'clause',
                    field,
                    operator: operator as LibraryFilterOperator,
                    value: filterValue,
                } satisfies LibraryFilterLeaf;
            }

            if (source.kind === 'group') {
                const mode = source.mode;
                const children = source.children;
                if (
                    typeof mode !== 'string' || !filterModes.has(mode as LibraryFilterMode) ||
                    !Array.isArray(children) || !children.length ||
                    children.length > MAX_FILTER_CONDITIONS
                ) throw new InvalidLibraryPageError('Invalid filter group');
                return {
                    kind: 'group',
                    mode: mode as LibraryFilterMode,
                    children: children.map((child) => parseNode(child, depth + 1)),
                } satisfies LibraryFilterGroup;
            }

            throw new InvalidLibraryPageError('Unknown filter node');
        };

        return normalizedFilterExpression(parseNode(parsed, 0));
    } catch {
        return null;
    }
}

function parseRequest(query: express.Request['query']): ParsedRequest | null {
    const sectionId = parseInteger(query.sectionId);
    const offset = parseInteger(query.offset);
    const size = parseInteger(query.size);
    const sort = single(query.sort) as LibrarySort | undefined;
    const type = single(query.type) as LibraryItemType | undefined;
    const sourceValue = single(query.source);
    const source = (sourceValue || 'all') as LibrarySource;
    const seed = single(query.seed);
    const filterExpression = parseFilterExpression(query.filterExpression);

    if (
        sectionId === null || sectionId < 1 ||
        offset === null || offset < 0 ||
        size === null || size < 1 || size > 256 ||
        !isValidPlexSort(sort) ||
        filterExpression === null ||
        !librarySources.has(source) ||
        (type && !itemTypes.has(type)) ||
        (isRandomSort(sort) && (
            source !== 'all' || !seed || !/^[a-zA-Z0-9_-]{1,64}$/.test(seed)
        ))
    ) return null;

    return {
        sectionId,
        source,
        offset,
        size,
        sort,
        ...(filterExpression && { filterExpression }),
        ...(type && { type }),
        ...(seed && { seed }),
    };
}

function plexSort(sort: LibrarySort) {
    if (sort === 'title:asc') return 'titleSort';
    if (sort === 'title:desc') return 'titleSort:desc';
    if (sort === 'updated:asc') return 'updatedAt:asc';
    if (sort === 'updated:desc') return 'updatedAt:desc';
    return sort;
}

function plexParams(
    request: Pick<ParsedRequest, 'filterExpression' | 'type'>,
    sort: string,
    offset: number,
    size: number,
) {
    const params = new URLSearchParams();
    params.set('sort', sort);
    if (request.type) params.set('type', String(typeNumbers[request.type]));
    params.set('excludeFields', excludedFields);
    params.set('excludeElements', excludedElements);
    params.set('X-Plex-Container-Start', String(offset));
    params.set('X-Plex-Container-Size', String(size));

    const appendFilter = (expression: LibraryFilterExpression) => {
        if (expression.kind === 'clause') {
            params.append(
                `${expression.field}${expression.operator.slice(0, -1)}`,
                expression.value,
            );
            return;
        }

        params.append('push', '1');
        expression.children.forEach((child, index) => {
            if (index) params.append(expression.mode, '1');
            appendFilter(child);
        });
        params.append('pop', '1');
    };
    if (request.filterExpression) appendFilter(request.filterExpression);
    return params;
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
    const randomCatalogs = new Map<string, RandomCatalog>();
    const randomOrders = new Map<string, RandomOrder>();
    const pendingCatalogs = new Map<string, Promise<RandomCatalog>>();

    const fetchContainer = async (
        token: string,
        request: ParsedRequest,
        sort: string,
        offset: number,
        size: number,
    ) => limiter.run(async () => {
        const response = await axios.get(
            `${plexServer}/library/sections/${request.sectionId}/${request.source}`,
            {
                params: plexParams(request, sort, offset, size),
                headers: { Accept: 'application/json', 'X-Plex-Token': token },
                timeout: 20000,
                ...(httpAgent && { httpAgent }),
                ...(httpsAgent && { httpsAgent }),
            },
        );
        return response.data?.MediaContainer;
    });

    const pruneRandomCaches = () => {
        while (randomCatalogs.size > RANDOM_CATALOG_LIMIT) {
            const oldest = [...randomCatalogs.entries()]
                .sort((left, right) => left[1].lastUsed - right[1].lastUsed)[0];
            if (!oldest) break;
            randomCatalogs.delete(oldest[0]);
            for (const key of randomOrders.keys())
                if (key.startsWith(`${oldest[0]}:`)) randomOrders.delete(key);
        }

        while (randomOrders.size > RANDOM_ORDER_LIMIT) {
            const oldest = [...randomOrders.entries()]
                .sort((left, right) => left[1].lastUsed - right[1].lastUsed)[0];
            if (!oldest) break;
            randomOrders.delete(oldest[0]);
        }
    };

    const randomCatalogKey = (token: string, request: ParsedRequest) => [
        tokenCacheKey(token),
        request.sectionId,
        request.type || 'any',
        createHash('sha256')
            .update(JSON.stringify(request.filterExpression || null))
            .digest('hex')
            .slice(0, 16),
    ].join(':');

    const loadRandomCatalog = async (
        token: string,
        request: ParsedRequest,
    ): Promise<RandomCatalog> => {
        for (let attempt = 0; attempt < 2; attempt += 1) {
            let offset = 0;
            let totalSize: number | null = null;
            const items: LibraryCardDto[] = [];
            const ratingKeys = new Set<string>();
            let duplicateFound = false;

            do {
                const container = await fetchContainer(
                    token,
                    request,
                    'titleSort',
                    offset,
                    RANDOM_FETCH_SIZE,
                );
                const page = projectLibraryPage(container, offset, RANDOM_FETCH_SIZE);
                if (page.offset !== offset)
                    throw new InvalidLibraryPageError('Plex returned a mismatched library page');
                if (offset === 0) {
                    totalSize = page.totalSize;
                } else if (page.totalSize !== totalSize)
                    throw new InvalidLibraryPageError('Plex changed the library during pagination');
                for (const item of page.items) {
                    if (ratingKeys.has(item.ratingKey)) {
                        duplicateFound = true;
                        break;
                    }
                    ratingKeys.add(item.ratingKey);
                    items.push(item);
                }
                if (duplicateFound) break;
                offset += page.size;
                if (!page.hasMore || page.size === 0) break;
            } while (totalSize === null || offset < totalSize);

            if (duplicateFound || (totalSize !== null && items.length !== totalSize)) {
                if (attempt === 0) continue;
                throw new InvalidLibraryPageError('Plex changed the library during pagination');
            }

            const generationHash = createHash('sha256');
            for (const ratingKey of [...ratingKeys].sort())
                generationHash.update(ratingKey).update('\0');

            return {
                request,
                items,
                generationId: generationHash.digest('hex').slice(0, 24),
                loadedAt: Date.now(),
                lastUsed: Date.now(),
            };
        }
        throw new InvalidLibraryPageError('Unable to build a consistent Plex library catalog');
    };

    const getRandomCatalog = async (
        token: string,
        request: ParsedRequest,
    ): Promise<{ key: string; catalog: RandomCatalog }> => {
        const key = randomCatalogKey(token, request);
        const pending = pendingCatalogs.get(key);
        if (pending) return { key, catalog: await pending };

        const cached = randomCatalogs.get(key);
        if (
            cached &&
            Date.now() - cached.loadedAt <= RANDOM_CATALOG_TTL_MS
        ) {
            cached.lastUsed = Date.now();
            return { key, catalog: cached };
        }

        const loading = loadRandomCatalog(token, request);
        pendingCatalogs.set(key, loading);

        try {
            const catalog = await loading;
            if (pendingCatalogs.get(key) === loading) {
                for (const orderKey of randomOrders.keys())
                    if (orderKey.startsWith(`${key}:`)) randomOrders.delete(orderKey);
                randomCatalogs.set(key, catalog);
                pruneRandomCaches();
            }
            return { key, catalog };
        } finally {
            if (pendingCatalogs.get(key) === loading) pendingCatalogs.delete(key);
        }
    };

    const getRandomOrder = (key: string, catalog: RandomCatalog, seed: string) => {
        // An invalidated in-flight catalog may finish for its old HTTP caller,
        // but cannot read or overwrite the current order cache.
        if (randomCatalogs.get(key) !== catalog) return stableRandomOrder(catalog.items, seed);
        const orderKey = `${key}:${catalog.generationId}:${seed}`;
        const cached = randomOrders.get(orderKey);
        if (cached) {
            cached.lastUsed = Date.now();
            return cached.items;
        }

        // TODO(scale): Above a configurable item limit, choose enough deterministic
        // hash partitions to keep every in-memory partition below that limit.
        const items = stableRandomOrder(catalog.items, seed);
        randomOrders.set(orderKey, { items, lastUsed: Date.now() });
        pruneRandomCaches();
        return items;
    };

    const evictCatalog = (key: string) => {
        randomCatalogs.delete(key);
        pendingCatalogs.delete(key); // An older rebuild must not repopulate invalidated data.
        for (const orderKey of randomOrders.keys())
            if (orderKey.startsWith(`${key}:`)) randomOrders.delete(orderKey);
    };
    const matchingKeys = (token: string, sectionId?: string) =>
        [...new Set([...randomCatalogs.keys(), ...pendingCatalogs.keys()])]
            .filter(key => key.startsWith(`${tokenCacheKey(token)}:`) &&
                (!sectionId || key.split(':')[1] === sectionId));

    router.delete('/catalog', (req, res) => {
        const token = req.headers['x-plex-token'];
        const sectionId = single(req.query.sectionId);
        if (typeof token !== 'string' || !token) return res.status(401).send({ error: 'Missing Plex session' });
        if (sectionId !== undefined && !/^[1-9]\d*$/.test(sectionId))
            return res.status(400).send({ error: 'Invalid library section' });
        matchingKeys(token, sectionId).forEach(evictCatalog);
        return res.status(204).send();
    });

    // Read authorized canonical data. Client PUT fields are never trusted as a delta.
    router.post('/synchronize', async (req, res) => {
        const token = req.headers['x-plex-token'];
        const id = single(req.query.id);
        const includeDetails = req.query.includeDetails === 'true';
        if (typeof token !== 'string' || !token) return res.status(401).send({ error: 'Missing Plex session' });
        if (!id || !/^\d+$/.test(id)) return res.status(400).send({ error: 'Invalid media ID' });
        res.set('Cache-Control', 'private, no-store');
        try {
            const response = await limiter.run(() => axios.get(`${plexServer}/library/metadata/${id}`, {
                ...(includeDetails && { params: mediaMetadataIncludes }),
                headers: { Accept: 'application/json', 'X-Plex-Token': token }, timeout: 20000,
                ...(httpAgent && { httpAgent }), ...(httpsAgent && { httpsAgent }),
            }));
            const metadata = response.data?.MediaContainer?.Metadata?.[0];
            if (!metadata || String(metadata.ratingKey) !== id)
                throw new InvalidLibraryPageError('Missing canonical metadata');
            const sectionId = metadata.librarySectionID === undefined ? undefined : String(metadata.librarySectionID);
            const parentIds = [metadata.parentRatingKey, metadata.grandparentRatingKey]
                .filter((value): value is string => typeof value === 'string' && /^\d+$/.test(value));
            const item = itemTypes.has(metadata.type) ? projectLibraryCards([metadata])[0] : null;
            // Section moves invalidate the old section too; absence can mean entry into a filter.
            for (const key of matchingKeys(token)) {
                const catalog = randomCatalogs.get(key);
                const before = catalog?.items.find(card => card.ratingKey === id);
                if (!before && sectionId && key.split(':')[1] !== sectionId) continue;
                const fields = before && item ? changedLibraryFields(before, item) : [];
                const stable = before && item && catalog &&
                    !fields.some(field => ['type', 'librarySectionID', 'parentRatingKey', 'grandparentRatingKey', 'Collection'].includes(field)) &&
                    libraryFilterUnaffected(catalog.request.filterExpression, fields) &&
                    !(parentIds.length && (!catalog.request.type || catalog.request.type === 'show'));
                if (!stable || pendingCatalogs.has(key)) { evictCatalog(key); continue; }
                catalog.items = catalog.items.map(card => card.ratingKey === id ? item : card);
                for (const [orderKey, order] of randomOrders)
                    if (orderKey.startsWith(`${key}:`))
                        order.items = order.items.map(card => card.ratingKey === id ? item : card);
            }
            // Children can change parent aggregates, including random show catalogs.
            if (parentIds.length) for (const key of matchingKeys(token, sectionId)) {
                const catalog = randomCatalogs.get(key);
                if (!catalog || !catalog.request.type || catalog.request.type === 'show') evictCatalog(key);
            }
            return res.send({ item, sectionId, parentIds, ...(includeDetails && { metadata }) });
        } catch (error) {
            const status = axios.isAxiosError(error) ? error.response?.status : undefined;
            if (status === 404) {
                matchingKeys(token).forEach(evictCatalog);
                return res.send({ item: null });
            }
            return res.status(status && status < 500 ? status : 502).send({ error: 'Unable to synchronize Plex metadata' });
        }
    });

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
            if (isRandomSort(request.sort)) {
                const { key, catalog } = await getRandomCatalog(token, request);
                const orderedItems = getRandomOrder(key, catalog, request.seed as string);
                const items = orderedItems.slice(request.offset, request.offset + request.size);
                page = {
                    offset: request.offset,
                    size: items.length,
                    totalSize: orderedItems.length,
                    hasMore: request.offset + items.length < orderedItems.length,
                    generationId: catalog.generationId,
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
                retryable: !(error instanceof InvalidLibraryPageError) &&
                    (!upstreamStatus || upstreamStatus >= 500),
            });
        }
    });

    return router;
}
