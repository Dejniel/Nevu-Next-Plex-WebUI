import {
  AuthStorage,
  useAuthSession,
  useServerSession,
} from "features/session/model";
import { PlexClient } from "shared/api/PlexClient";
import { readPlexMetadataPage } from "shared/api/plexPagination";
import {
  PlexResponseError,
  plexFields,
  plexInteger,
} from "shared/api/plexResponse";
import {
  readListEntry,
  readListSummary,
  readSingleList,
} from "./mediaListResponse";
import { useUserSettings } from "features/settings/model";
import {
  publishMediaChange,
  readPlaybackQueueItem,
  type PlaybackQueueItem,
} from "entities/media/model";
import {
  assertMediaListItem,
  playlistTypeForItem,
  type MediaListItem,
  type MediaListDestination,
} from "../model/mediaListEditing";
import { validateListWindow } from "../model/mediaLists";
import type {
  MediaListEntry,
  MediaListPage,
  MediaListQuery,
  MediaListSummary,
  PlaylistPlaybackContext,
} from "../model/mediaLists";

/** Fill a requested window even if Plex caps a response below its requested size. */
async function readWindow<T>(
  client: PlexClient,
  path: string,
  params: URLSearchParams,
  offset: number,
  size: number,
  read: (value: unknown, position: number, section?: number) => T,
  signal?: AbortSignal,
) {
  const items: T[] = [];
  let total: number | null = null;
  let section: number | undefined;
  while (items.length < size) {
    if (signal?.aborted)
      throw new DOMException("The request was cancelled.", "AbortError");
    const start = offset + items.length;
    const remaining = size - items.length;
    params.set("X-Plex-Container-Start", String(start));
    params.set("X-Plex-Container-Size", String(remaining));
    const response = await client.get<unknown>(`${path}?${params}`, signal);
    signal?.throwIfAborted();
    const {
      container,
      rows: page,
      total: nextTotal,
    } = readPlexMetadataPage(response, "media list data", start, remaining);
    const nextSection = plexFields(container, {
      librarySectionID: (value) => plexInteger(value, "media list data"),
    }).librarySectionID;
    if (
      (total !== null && nextTotal !== undefined && nextTotal !== total) ||
      (section !== undefined &&
        nextSection !== undefined &&
        nextSection !== section) ||
      (total !== null &&
        (start + page.length > total || (!page.length && start < total)))
    )
      throw new PlexResponseError("media list data");
    section ??= nextSection;
    items.push(...page.map((row, index) => read(row, start + index, section)));
    total =
      nextTotal ??
      total ??
      (page.length < remaining ? start + page.length : null);
    if (!page.length || (total !== null && offset + items.length >= total))
      break;
  }
  return { offset, total, items };
}

function clientForSession() {
  const token = AuthStorage.getServerToken();
  if (!token) throw new Error("The active Plex session is missing.");
  return new PlexClient(() => token);
}

function listPath(query: MediaListQuery) {
  if (query.kind === "playlist")
    return `/playlists${query.id ? `/${encodeURIComponent(query.id)}` : ""}`;
  if (query.id) return `/library/metadata/${encodeURIComponent(query.id)}`;
  if (!query.libraryID)
    throw new Error("Choose a library to browse its collections.");
  return `/library/sections/${encodeURIComponent(query.libraryID)}/collections`;
}

export function createMediaListSource(
  query: MediaListQuery,
  signal?: AbortSignal,
) {
  const client = clientForSession();
  const path = listPath(query);
  const localServer = useServerSession.getState().server?.machineIdentifier;
  return {
    async summary(): Promise<MediaListSummary | null> {
      if (!query.id) return null;
      return readSingleList(
        await client.get<unknown>(path, signal),
        query.kind,
        query.id,
      );
    },
    async page(offset: number, size: number): Promise<MediaListPage> {
      const params = new URLSearchParams({
        "X-Plex-Container-Start": String(offset),
        "X-Plex-Container-Size": String(size),
      });
      if (!query.id) {
        params.set("sort", query.sort ?? "titleSort:asc");
        if (query.search) params.set("title", query.search);
        if (query.kind === "playlist")
          params.set("playlistType", query.playlistType ?? "video");
      }
      const suffix = query.id
        ? query.kind === "playlist"
          ? "/items"
          : "/children"
        : "";
      const page = await readWindow(
        client,
        path + suffix,
        params,
        offset,
        size,
        (row, position, section) =>
          query.id
            ? readListEntry(row, position, query.kind, section, localServer)
            : readListSummary(row, query.kind, section),
        signal,
      );
      validateListWindow([page], query.kind);
      return page;
    },
  };
}

async function readPlaylistSelection(
  context: PlaylistPlaybackContext,
  currentID: string,
  size: number,
  signal?: AbortSignal,
) {
  const page = await createMediaListSource(
    {
      kind: "playlist",
      id: context.id,
    },
    signal,
  ).page(context.index, size);
  const entries = page.items.filter(
    (item): item is MediaListEntry => item.kind === "media",
  );
  if (
    entries[0]?.item.ratingKey !== currentID ||
    (context.itemID && entries[0].playlistItemID !== context.itemID)
  )
    throw new Error(
      "This playlist has changed. Open it again to continue in its current order.",
    );
  if (!entries.every((entry) => entry.supported))
    throw new Error("The next playlist item cannot be played on this server.");
  return entries;
}

export async function getPlaylistEntry(
  context: PlaylistPlaybackContext,
  currentID: string,
  signal?: AbortSignal,
) {
  return (await readPlaylistSelection(context, currentID, 1, signal))[0].item;
}

export async function getPlaylistQueue(
  context: PlaylistPlaybackContext,
  currentID: string,
  signal?: AbortSignal,
): Promise<PlaybackQueueItem[]> {
  const entries = await readPlaylistSelection(context, currentID, 2, signal);
  if (entries.some((entry) => !["movie", "episode"].includes(entry.item.type)))
    throw new Error("The next playlist item cannot be played on this server.");
  return entries.map((entry) =>
    readPlaybackQueueItem({
      ...entry.item,
      ...(entry.playlistItemID !== undefined && {
        playlistItemID: Number(entry.playlistItemID),
      }),
    }),
  );
}

export async function getMediaListChoices(
  kind: MediaListQuery["kind"],
  item: MediaListItem,
  signal: AbortSignal,
) {
  assertMediaListItem(kind, item);
  const source = createMediaListSource(
    {
      kind,
      libraryID: String(item.librarySectionID),
      playlistType: playlistTypeForItem(item.type) ?? undefined,
    },
    signal,
  );
  const lists: MediaListSummary[] = [];
  for (let offset = 0; ; offset += 100) {
    const page = await source.page(offset, 100);
    page.items.forEach((entry) => {
      if (
        entry.kind !== "media" &&
        (kind === "playlist"
          ? entry.playlistType === playlistTypeForItem(item.type)
          : !entry.itemType || entry.itemType === item.type)
      )
        lists.push(entry);
    });
    if (
      page.items.length < 100 ||
      (page.total !== null && offset + page.items.length >= page.total)
    )
      break;
  }
  return lists;
}

export async function saveMediaListItem(
  kind: MediaListQuery["kind"],
  item: MediaListItem,
  destination: MediaListDestination,
): Promise<MediaListSummary> {
  assertMediaListItem(kind, item);
  if (kind === "collection" && !useServerSession.getState().canManageServer)
    throw new Error(
      "Managing collections requires permission to edit this Plex library.",
    );
  const client = clientForSession();
  const token = AuthStorage.getServerToken();
  const profileKey = useUserSettings.getState().profileKey;
  if (!profileKey)
    throw new Error("The active Plex profile is unavailable. Sign in again.");
  const server = useServerSession.getState().server?.machineIdentifier;
  if (!server)
    throw new Error("The active Plex server is unavailable. Please try again.");
  const revision = useAuthSession.getState().revision;
  const assertCurrent = () => {
    if (
      AuthStorage.getServerToken() !== token ||
      useUserSettings.getState().profileKey !== profileKey ||
      useServerSession.getState().server?.machineIdentifier !== server ||
      useAuthSession.getState().revision !== revision
    )
      throw new Error("The active profile changed. Open this action again.");
  };
  const uri = `server://${server}/com.plexapp.plugins.library/library/metadata/${item.ratingKey}`;
  const params = new URLSearchParams({ uri });
  let result: MediaListSummary;
  if ("id" in destination) {
    if (!/^\d+$/.test(destination.id))
      throw new Error("Choose a valid Plex list.");
    const path = listPath({ kind, id: destination.id });
    result = readSingleList(
      await client.get<unknown>(path),
      kind,
      destination.id,
    );
    if (
      kind === "playlist" &&
      result.playlistType !== playlistTypeForItem(item.type)
    )
      throw new Error("Choose a playlist of the same media type.");
    if (result.smart)
      throw new Error(
        "Smart lists add items automatically from their filters.",
      );
    if (
      kind === "collection" &&
      (result.libraryID !== String(item.librarySectionID) ||
        result.itemType !== item.type)
    )
      throw new Error(
        "Choose a collection of this media type in the same library.",
      );
    assertCurrent();
    const itemsPath =
      kind === "playlist"
        ? `${path}/items`
        : `/library/collections/${destination.id}/items`;
    await client.put(`${itemsPath}?${params}`, undefined);
  } else {
    const title = destination.title.trim();
    if (!title) throw new Error("Enter a name for the new list.");
    params.set("title", title);
    params.set("smart", "0");
    params.set(
      "type",
      kind === "playlist"
        ? playlistTypeForItem(item.type)!
        : item.type === "movie"
          ? "1"
          : "2",
    );
    if (kind === "collection")
      params.set("sectionId", String(item.librarySectionID));
    const response = await client.post<unknown>(
      `${kind === "playlist" ? "/playlists" : "/library/collections"}?${params}`,
    );
    try {
      result = readSingleList(response, kind);
    } catch (cause) {
      throw new Error(
        "Plex did not return a valid new list. Open your lists before trying again.",
        { cause },
      );
    }
    if (kind === "collection") result.libraryID = String(item.librarySectionID);
  }
  assertCurrent();
  const scope = { serverId: server, profileKey };
  publishMediaChange({
    ...scope,
    kind: "list",
    listKind: kind,
    id: result.id,
    ...(kind === "collection" && { sectionId: String(item.librarySectionID) }),
  });
  if (kind === "collection")
    publishMediaChange({
      ...scope,
      kind: "item",
      effect: "unknown",
      id: item.ratingKey,
      sectionId: String(item.librarySectionID),
    });
  return result;
}
