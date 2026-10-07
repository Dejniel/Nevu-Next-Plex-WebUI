import { isLibraryItemType, isVideoLibraryItemType } from '@nevu/contracts';
import type { LibraryCardDto, LibraryItemType, LibraryPageDto } from '@nevu/contracts';

type JsonObject = Record<string, unknown>;

export class InvalidLibraryPageError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'InvalidLibraryPageError';
    }
}

const commonFields = [
    'ratingKey', 'key', 'guid', 'type', 'title', 'titleSort', 'librarySectionID',
    'addedAt', 'updatedAt', 'lastViewedAt', 'originallyAvailableAt', 'studio',
    'contentRating', 'userRating', 'parentTitle', 'grandparentTitle',
    'parentRatingKey', 'grandparentRatingKey', 'parentThumb', 'grandparentThumb',
    'parentIndex', 'index', 'year', 'thumb', 'art', 'audienceRating',
    'audienceRatingImage', 'rating', 'ratingImage',
];
const cardFields = {
    video: [...commonFields, 'duration', 'seasonCount', 'childCount', 'viewCount', 'viewOffset', 'viewedLeafCount', 'leafCount'],
    music: [...commonFields, 'duration', 'childCount', 'leafCount', 'viewCount'],
    photo: [...commonFields, 'childCount', 'leafCount', 'composite'],
};
const mediaFields = {
    video: ['bitrate', 'height', 'videoDynamicRange', 'videoResolution', 'width'],
    music: ['audioCodec', 'audioChannels', 'bitrate', 'container'],
    photo: ['width', 'height', 'container'],
};

function pick(source: JsonObject, fields: readonly string[]) {
    return Object.fromEntries(fields.filter(field => source[field] !== undefined)
        .map(field => [field, source[field]]));
}

function projectArray(value: unknown, fields: readonly string[]) {
    return Array.isArray(value) ? value
        .filter((entry): entry is JsonObject => Boolean(entry && typeof entry === 'object'))
        .map(entry => pick(entry, fields)) : undefined;
}

/** Normalize Plex's photo Directory records once, at the catalog boundary. */
export function readLibraryMetadata(container: unknown, requestedType?: LibraryItemType): JsonObject[] {
    const source = container && typeof container === 'object' ? container as JsonObject : {};
    return ['Metadata', 'Directory'].flatMap(key => {
        const entries = source[key];
        if (entries === undefined) return [];
        if (!Array.isArray(entries)) throw new InvalidLibraryPageError('Library metadata is not an array');
        return entries.map((candidate, index) => {
            if (!candidate || typeof candidate !== 'object')
                throw new InvalidLibraryPageError(`Invalid library item at index ${index}`);
            const item = candidate as JsonObject;
            const photoAlbum = item.type === 'photo' && (key === 'Directory' ||
                requestedType === 'photoalbum' ||
                (typeof item.key === 'string' && /\/children(?:\?|$)/.test(item.key)));
            return photoAlbum ? { ...item, type: 'photoalbum' } : item;
        });
    });
}

export function projectLibraryCard(item: JsonObject): LibraryCardDto {
    if (typeof item.ratingKey !== 'string' || typeof item.title !== 'string' ||
        !isLibraryItemType(item.type) ||
        (item.guid !== undefined && typeof item.guid !== 'string') ||
        (isVideoLibraryItemType(item.type) && typeof item.guid !== 'string'))
        throw new InvalidLibraryPageError('Incomplete library item');

    const family = isVideoLibraryItemType(item.type) ? 'video'
        : item.type === 'photo' || item.type === 'photoalbum' ? 'photo' : 'music';
    const Genre = projectArray(item.Genre, ['id', 'tag'])?.filter(tag => typeof tag.tag === 'string');
    const Collection = projectArray(item.Collection, ['id', 'tag'])?.filter(tag => typeof tag.tag === 'string');
    const Media = projectArray(item.Media, mediaFields[family]);
    return {
        ...pick(item, cardFields[family]),
        ...(Genre && { Genre }), ...(Collection && { Collection }), ...(Media && { Media }),
    } as LibraryCardDto;
}

export function projectLibraryPage(
    container: unknown,
    requestedOffset = 0,
    requestedSize = 0,
    requestedType?: LibraryItemType,
): LibraryPageDto {
    const source = container && typeof container === 'object' ? container as JsonObject : {};
    const items = readLibraryMetadata(container, requestedType).map(projectLibraryCard).map(item => ({
        ...item,
        ...(item.librarySectionID === undefined && source.librarySectionID !== undefined && {
            librarySectionID: Number(source.librarySectionID),
        }),
    }));
    const offset = Number.isInteger(source.offset) ? Number(source.offset) : requestedOffset;
    const totalSize = Number.isInteger(source.totalSize) ? Number(source.totalSize) : null;
    const reportedSize = Number.isInteger(source.size) ? Number(source.size) : items.length;
    if (reportedSize !== items.length || (totalSize !== null && (offset + items.length > totalSize ||
        (items.length === 0 && offset < totalSize))))
        throw new InvalidLibraryPageError('Plex returned an inconsistent library page');
    return {
        offset, size: items.length, totalSize,
        hasMore: totalSize !== null ? offset + items.length < totalSize
            : requestedSize > 0 && items.length >= requestedSize,
        items,
    };
}
