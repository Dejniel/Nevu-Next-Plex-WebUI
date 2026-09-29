import axios from "axios";
import { authedGet, getIncludeProps, getXPlexProps, queryBuilder } from "./QuickFunctions";
import './plex.d.ts'
import { ProxiedRequest } from "shared/api/backend";
import { AuthStorage } from "features/session/model";
import { invalidateLibraryCache } from "shared/lib/libraryCache";

export {
    getResponsiveTranscodeImageProps,
    getTranscodeImageURL,
    HERO_IMAGE_WIDTHS,
    LANDSCAPE_IMAGE_WIDTHS,
    POSTER_IMAGE_WIDTHS,
    DETAIL_POSTER_IMAGE_WIDTHS,
} from "./images";


axios.defaults.headers.common['accept'] = 'application/json';

export async function getLibrary(key: string): Promise<Plex.MediaContainer> {
    const res = await authedGet(`/library/sections/${key}?${queryBuilder({
        includeDetails: 1,
    })}`);
    return res.MediaContainer;
}

/**
 * Fetches the items from the library directory.
 *
 * @param {string} key - The uri to identify the library directory. e.g. /library/sections/1/all
 * @param {Object.<string, any>} props - Additional properties to include in the query.
 * @returns {Promise<Plex.Metadata[]>} - A promise that resolves to an array of metadata items.
 */
export async function getLibraryDir(key: string, props?: { [key: string]: any }): Promise<Plex.MediaContainer> {
    const res = await authedGet(`${key}?${queryBuilder({
        ...props,
        ...getIncludeProps(),
    })}`);
    return res.MediaContainer;
}

export async function getLibrarySecondary(key: string, directory: string): Promise<Plex.Directory[]> {
    const res = await authedGet(`/library/sections/${key}/${directory}`);
    return res.MediaContainer.Directory;
}

export async function getLibraryMeta(id: string): Promise<Plex.Metadata> {
    if (!id) return {} as Plex.Metadata;
    const res = await authedGet(`/library/metadata/${id}?${queryBuilder({
        ...getIncludeProps(),
        ...getXPlexProps()
    })}`);
    return res.MediaContainer.Metadata[0];
}

export async function getLibraryMetaChildren(id: string): Promise<Plex.Metadata[]> {
    const res = await authedGet(`/library/metadata/${id}/children?${queryBuilder({
        ...getIncludeProps(),
        ...getXPlexProps()
    })}`);
    return res.MediaContainer.Metadata;

}

/**
 * Fetches search results from the Plex library based on the provided query.
 *
 * @param query - The search query string.
 * @returns A promise that resolves to an array of Plex search results.
 *
 * The function constructs a URL with the search query and additional parameters,
 * including collections, extras, search types (movies, other videos, TV), and a limit of 100 results.
 * It also includes the Plex access token from local storage for authentication.
 *
 * @throws Will throw an error if the request fails.
 */
export async function getSearch(query: string): Promise<Plex.SearchResult[]> {
    const res = await authedGet(`/library/search?${queryBuilder({
        query,
        "includeCollections": 1,
        "includeExtras": 1,
        "searchTypes": "movies,otherVideos,tv",
        "limit": 100,
        "X-Plex-Token": AuthStorage.getServerToken() as string
    })}`);
    return res.MediaContainer.SearchResult;
}

/**
 * Sets the media played status for a given rating key.
 *
 * This function sends a request to either scrobble or unscrobble a media item
 * based on the `watched` parameter. If `watched` is true, the media item is marked
 * as watched (scrobbled). If `watched` is false, the media item is marked as unwatched
 * (unscrobbled).
 *
 * @param watched - A boolean indicating whether the media item has been watched.
 * @param ratingKey - The unique identifier for the media item.
 * @returns A promise that resolves when the request is complete.
 */
export async function setMediaPlayedStatus(watched: boolean, ratingKey: string): Promise<void> {
    if (watched) {
        await authedGet(`/:/scrobble?${queryBuilder({
            key: ratingKey,
            identifier: "com.plexapp.plugins.library",
            ...getXPlexProps()
        })}`);
    } else {
        await authedGet(`/:/unscrobble?${queryBuilder({
            key: ratingKey,
            identifier: "com.plexapp.plugins.library",
            ...getXPlexProps()
        })}`);
    }
    invalidateLibraryCache();
}

/**
 * Sets the media rating for a given media item.
 *
 * @param rating - The rating to be set for the media item.
 * @param ratingKey - The unique key identifying the media item.
 * @returns A promise that resolves when the rating has been set.
 */
export async function setMediaRating(rating: number, ratingKey: string): Promise<boolean> {
    const response = await ProxiedRequest(`/:/rate?${queryBuilder({
        identifier: "com.plexapp.plugins.library",
        key: ratingKey,
        rating,
        ...getXPlexProps()
    })}`, "GET", {
        'X-Plex-Token': AuthStorage.getServerToken() as string,
        'accept': 'application/json'
    });
    return response.status === 200;
}

export interface LibraryDir {
    title: string;
    library: string;
    Metadata: Plex.Metadata[];
}


/**
 * Retrieves an item by its GUID from the Plex library.
 *
 * @param guid - The GUID of the item to retrieve.
 * @returns A promise that resolves to the item's metadata if found, or null if not found.
 *
 * @remarks
 * This function sends an authenticated GET request to the Plex library endpoint with various query parameters
 * to include external media, metadata, marker counts, and related items. The Plex access token is retrieved
 * from local storage and included in the request.
 *
 * @example
 * ```typescript
 * const metadata = await getItemByGUID("some-guid");
 * if (metadata) {
 *     console.log("Item found:", metadata);
 * } else {
 *     console.log("Item not found");
 * }
 * ```
 */
export async function getItemByGUID(guid: string): Promise<Plex.Metadata | null> {
    const res = await authedGet(`/library/all?${queryBuilder({
        guid,
        "includeExternalMedia": 1,
        "includeMeta": 1,
        "includeMarkerCounts": 1,
        "includeRelated": 1,
        "X-Plex-Token": AuthStorage.getServerToken() as string
    })}`);

    if (res.MediaContainer.Metadata?.[0]?.guid !== guid) return null;

    return res.MediaContainer.Metadata?.[0];
}
