import axios from "axios";
import { authedGet, authedPost, authedPut, getIncludeProps, getXPlexProps, queryBuilder } from "./QuickFunctions";
import './plex.d.ts'
import { ProxiedRequest } from "shared/api/backend";
import { platformCache } from "../common/DesktopApp";
import { AuthStorage } from "../auth/AuthStorage";
import { invalidateLibraryCache } from "shared/lib/libraryCache";

export {
    getResponsiveTranscodeImageProps,
    getTranscodeImageURL,
    HERO_IMAGE_WIDTHS,
    LANDSCAPE_IMAGE_WIDTHS,
    POSTER_IMAGE_WIDTHS,
    DETAIL_POSTER_IMAGE_WIDTHS,
} from "./images";

export { getAccessToken, getLoggedInUser, getPin } from "./auth";

axios.defaults.headers.common['accept'] = 'application/json';

export async function getAllLibraries(): Promise<Plex.LibarySection[]> {
    const res = await authedGet(`/library/sections`);
    return res.MediaContainer.Directory;
}

export async function getLibrary(key: string): Promise<Plex.MediaContainer> {
    const res = await authedGet(`/library/sections/${key}?${queryBuilder({
        includeDetails: 1,
    })}`);
    return res.MediaContainer;
}

/**
 * @deprecated This function is deprecated. Use `getLibraryDir` instead.
 */
export async function getLibraryMedia(path: string): Promise<Plex.Metadata[]> {
    const res = await authedGet(`/library${path}`);
    return res.MediaContainer.Metadata;
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

export async function getSimilar(id: string): Promise<Plex.Metadata[]> {
    if (!id) return [];
    const res = await authedGet(`/library/metadata/${id}/similar?${queryBuilder({
        limit: 10,
        excludeFields: "summary",
        includeMarkerCounts: 1,
        includeRelated: 1,
        includeExternalMedia: 1,
        async: 1,
        ...getXPlexProps()
    })}`);
    return res.MediaContainer.Metadata;
}

export interface StreamLimitations {
    autoAdjustQuality?: boolean,
    maxVideoBitrate?: number,
    mediaIndex?: number,
    partIndex?: number,
}

export async function getUniversalDecision(id: string, limitation: StreamLimitations): Promise<void> {
    await authedGet(`/video/:/transcode/universal/decision?${queryBuilder({
        ...getStreamProps(id, limitation),
    })}`);
    return;
}

export async function sendUniversalPing() {
    await authedGet(`/video/:/transcode/universal/ping?${queryBuilder({
        ...getXPlexProps()
    })}`);
    return;
}

/**
 * Generates the stream properties for a given media ID with optional limitations.
 *
 * @param key - The unique rating key for the media.
 * @param limitation - An object containing optional limitations for the stream.
 * @param limitation.autoAdjustQuality - Whether to automatically adjust the quality of the stream.
 * @param limitation.maxVideoBitrate - The maximum video bitrate for the stream.
 * @returns An object containing the stream properties.
 */
export function getStreamProps(key: string, limitation: StreamLimitations) {
    return {
        audioBoost: 700,
        autoAdjustQuality: limitation.autoAdjustQuality ? 1 : 0,
        autoAdjustSubtitle: 0,
        directPlay: limitation.maxVideoBitrate === -1 ? 1 : 0,
        directStream: 1,
        directStreamAudio: 1,
        fastSeek: 1,
        hasMDE: 1,
        location: "lan",
        mediaBufferSize: 102400,
        mediaIndex: limitation.mediaIndex ?? 0,
        partIndex: limitation.partIndex ?? 0,
        path: "/library/metadata/" + key,
        protocol: platformCache.isDesktop ? "hls" : "dash",
        addDebugOverlay: 0,
        subtitleSize: 100,
        subtitles: limitation.maxVideoBitrate === -1 ? "sidecar" : "burn",
        "Accept-Language": "en",
        ...getXPlexProps(),
        ...(limitation.autoAdjustQuality && {
            autoAdjustQuality: limitation.autoAdjustQuality ? 1 : 0
        }),
        ...(limitation.maxVideoBitrate && limitation.maxVideoBitrate !== -1 && {
            maxVideoBitrate: limitation.maxVideoBitrate,
        })
    }
}

/**
 * Updates the audio stream for a specific part in the library.
 *
 * @param partID - The ID of the part to update.
 * @param streamID - The ID of the new audio stream to set.
 * @returns A promise that resolves when the update is complete.
 */
export async function putAudioStream(partID: number, streamID: number): Promise<void> {
    await authedPut(`/library/parts/${partID}?${queryBuilder({
        audioStreamID: streamID,
        ...getXPlexProps()
    })}`, {});
}

/**
 * Sends an authenticated PUT request to update the subtitle stream for a given part.
 *
 * @param partID - The ID of the part to update.
 * @param streamID - The ID of the subtitle stream to set.
 * @returns A promise that resolves when the request is complete.
 */
export async function putSubtitleStream(partID: number, streamID: number): Promise<void> {
    await authedPut(`/library/parts/${partID}?${queryBuilder({
        subtitleStreamID: streamID,
        ...getXPlexProps()
    })}`, {});
}

/**
 * Fetches a timeline update for a given item.
 *
 * @param key - The ID of the item to get the timeline update for.
 * @param duration - The duration of the item in milliseconds.
 * @param state - The current state of the item (e.g., playing, paused).
 * @param time - The current playback time in milliseconds.
 * @returns A promise that resolves to a `Plex.TimelineUpdateResult` object containing the timeline update information.
 */
export async function getTimelineUpdate(key: number, duration: number, state: string, time: number): Promise<Plex.TimelineUpdateResult> {
    return await authedGet(`/:/timeline?${queryBuilder({
        ratingKey: key,
        key: `/library/metadata/${key}/`,
        duration: duration,
        state: state,
        playbackTime: time,
        time: time,
        context: "library",
        ...getXPlexProps()
    })}`);
}

/**
 * Fetches the server preferences from the Plex server.
 *
 * @returns {Promise<Plex.ServerPreferences>} A promise that resolves to the server preferences.
 */
export async function getServerPreferences(): Promise<Plex.ServerPreferences> {
    const res = await authedGet(`/`);
    return res.MediaContainer;
}

/**
 * Retrieves the play queue for a given URI.
 *
 * @param uri - The URI of the media item to get the play queue for.
 * @returns A promise that resolves to an array of Plex metadata objects.
 */
export async function getPlayQueue(uri: string): Promise<Plex.Metadata[]> {
    const res = await authedPost(`/playQueues?${queryBuilder({
        type: "video",
        uri,
        continuous: 1,
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
