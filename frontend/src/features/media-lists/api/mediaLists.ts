import { AuthStorage, useServerSession } from "features/session/model";
import { PlexClient } from "shared/api/PlexClient";
import { useUserSettings } from "features/settings/model";
import { publishMediaChange } from "entities/media/model";
import {
  assertMediaListItem,
  type MediaListItem,
  type MediaListDestination,
} from "../model/mediaListEditing";
import type {
  MediaListEntry,
  MediaListPage,
  MediaListQuery,
  MediaListSummary,
  PlaylistPlaybackContext,
} from "../model/mediaLists";

interface ListMetadata {
  ratingKey: string;
  type: string;
  title: string;
  summary?: string;
  thumb?: string;
  composite?: string;
  art?: string;
  childCount?: number;
  leafCount?: number;
  smart?: boolean | number;
  playlistType?: string;
  librarySectionID?: number;
  subtype?: string;
}

interface Container<T> {
  MediaContainer?: {
    Metadata?: T[];
    offset?: number;
    totalSize?: number;
    librarySectionID?: number;
  };
}

type ListEntryMetadata = Plex.Metadata & {
  playlistItemID?: number;
  sourceURI?: string;
};

/** Fill a requested window even if Plex caps a response below its requested size. */
async function readWindow<T>(
  client: PlexClient,
  path: string,
  params: URLSearchParams,
  offset: number,
  size: number,
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
    const response = await client.get<Container<T>>(`${path}?${params}`, signal);
    const container = response.MediaContainer;
    if (!container) throw new Error("Plex returned invalid media list data.");
    const page = container.Metadata ?? [];
    if (
      !Array.isArray(page) ||
      (container.offset ?? start) !== start ||
      page.length > remaining ||
      (container.totalSize !== undefined &&
        (!Number.isSafeInteger(container.totalSize) ||
          container.totalSize < 0)) ||
      (!page.length && (container.totalSize ?? 0) > start)
    )
      throw new Error("Plex returned incomplete media list data.");
    section ??= container.librarySectionID;
    items.push(...page);
    total =
      container.totalSize ??
      (page.length < remaining ? start + page.length : null);
    if (!page.length || (total !== null && offset + items.length >= total))
      break;
  }
  return { offset, total, items, section };
}

function clientForSession() {
  const token = AuthStorage.getServerToken();
  if (!token) throw new Error("The active Plex session is missing.");
  return new PlexClient(() => token);
}

function listSummary(
  item: ListMetadata,
  kind: MediaListQuery["kind"],
): MediaListSummary {
  if (
    item.type !== kind ||
    !item.ratingKey ||
    !item.title ||
    (kind === "playlist" && item.playlistType !== "video")
  )
    throw new Error("Plex returned an unsupported media list.");
  return {
    kind,
    id: String(item.ratingKey),
    title: item.title,
    summary: item.summary ?? "",
    image: item.thumb || item.composite || item.art,
    count: item.childCount ?? item.leafCount ?? 0,
    smart: Boolean(item.smart),
    libraryID:
      item.librarySectionID === undefined
        ? undefined
        : String(item.librarySectionID),
    itemType: item.subtype,
  };
}

function itemEntry(
  item: ListEntryMetadata,
  position: number,
  section?: number,
  localServer?: string,
): MediaListEntry {
  const sourceServer = item.sourceURI?.match(/^server:\/\/([^/]+)/)?.[1];
  return {
    kind: "media",
    position,
    playlistItemID:
      item.playlistItemID === undefined
        ? undefined
        : String(item.playlistItemID),
    item: { ...item, librarySectionID: item.librarySectionID ?? section ?? 0 },
    supported:
      ["movie", "show", "episode"].includes(item.type) &&
      Boolean(item.ratingKey) &&
      (!sourceServer || sourceServer === localServer),
  };
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
      const response = await client.get<Container<ListMetadata>>(path, signal);
      const item = response.MediaContainer?.Metadata?.[0];
      if (!item)
        throw new Error(
          "This list is no longer available to the active profile.",
        );
      return listSummary(item, query.kind);
    },
    async page(offset: number, size: number): Promise<MediaListPage> {
      const params = new URLSearchParams({
        "X-Plex-Container-Start": String(offset),
        "X-Plex-Container-Size": String(size),
      });
      if (!query.id) {
        params.set("sort", query.sort ?? "titleSort:asc");
        if (query.search) params.set("title", query.search);
        if (query.kind === "playlist") params.set("playlistType", "video");
      }
      const suffix = query.id
        ? query.kind === "playlist"
          ? "/items"
          : "/children"
        : "";
      if (query.id) {
        const page = await readWindow<ListEntryMetadata>(
          client,
          path + suffix,
          params,
          offset,
          size,
          signal,
        );
        return {
          offset,
          total: page.total,
          items: page.items.map((item, index) =>
            itemEntry(item, offset + index, page.section, localServer),
          ),
        };
      }
      const page = await readWindow<ListMetadata>(
        client,
        path,
        params,
        offset,
        size,
        signal,
      );
      return {
        offset,
        total: page.total,
        items: page.items.map((item) => listSummary(item, query.kind)),
      };
    },
  };
}

export async function getPlaylistQueue(
  context: PlaylistPlaybackContext,
  currentID: string,
): Promise<Plex.Metadata[]> {
  const page = await createMediaListSource({
    kind: "playlist",
    id: context.id,
  }).page(context.index, 2);
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
  if (
    entries.some(
      (entry) =>
        !entry.supported || !["movie", "episode"].includes(entry.item.type),
    )
  )
    throw new Error("The next playlist item cannot be played on this server.");
  return entries.map((entry) => entry.item);
}

export async function getMediaListChoices(
  kind: MediaListQuery["kind"],
  item: MediaListItem,
  signal: AbortSignal,
) {
  assertMediaListItem(kind, item);
  const source = createMediaListSource(
    { kind, libraryID: String(item.librarySectionID) },
    signal,
  );
  const lists: MediaListSummary[] = [];
  for (let offset = 0; ; offset += 100) {
    const page = await source.page(offset, 100);
    page.items.forEach((entry) => {
      if (
        entry.kind !== "media" &&
        (kind === "playlist" || !entry.itemType || entry.itemType === item.type)
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
  const uri = `server://${server}/com.plexapp.plugins.library/library/metadata/${item.ratingKey}`;
  const params = new URLSearchParams({ uri });
  let result: MediaListSummary;
  if ("id" in destination) {
    if (!/^\d+$/.test(destination.id))
      throw new Error("Choose a valid Plex list.");
    const path = listPath({ kind, id: destination.id });
    const response = await client.get<Container<ListMetadata>>(path);
    const existing = response.MediaContainer?.Metadata?.[0];
    if (!existing) throw new Error("This list is no longer available.");
    result = listSummary(existing, kind);
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
    if (
      AuthStorage.getServerToken() !== token ||
      useUserSettings.getState().profileKey !== profileKey
    )
      throw new Error("The active profile changed. Open this action again.");
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
      kind === "playlist" ? "video" : item.type === "movie" ? "1" : "2",
    );
    if (kind === "collection")
      params.set("sectionId", String(item.librarySectionID));
    const response = await client.post<Container<ListMetadata>>(
      `${kind === "playlist" ? "/playlists" : "/library/collections"}?${params}`,
    );
    const created = response.MediaContainer?.Metadata?.[0];
    if (!created)
      throw new Error(
        "Plex did not return the new list. Open the list again before trying again.",
      );
    result = listSummary(created, kind);
    if (kind === "collection") result.libraryID = String(item.librarySectionID);
  }
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
