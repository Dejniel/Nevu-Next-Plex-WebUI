import { AuthStorage, useServerSession } from "features/session/model";
import { PlexClient } from "shared/api/PlexClient";
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
}

interface Container<T> {
  MediaContainer?: {
    Metadata?: T[];
    offset?: number;
    totalSize?: number;
    librarySectionID?: number;
  };
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
  };
}

function itemEntry(
  item: Plex.Metadata & { playlistItemID?: number; sourceURI?: string },
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

export function createMediaListSource(query: MediaListQuery) {
  const client = clientForSession();
  const path = listPath(query);
  const localServer = useServerSession.getState().server?.machineIdentifier;
  return {
    async summary(): Promise<MediaListSummary | null> {
      if (!query.id) return null;
      const response = await client.get<Container<ListMetadata>>(path);
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
      const response = await client.get<
        Container<ListMetadata & Plex.Metadata>
      >(`${path}${suffix}?${params}`);
      const container = response.MediaContainer;
      if (!container) throw new Error("Plex returned invalid media list data.");
      const items = container.Metadata ?? [];
      if (
        (container.offset ?? offset) !== offset ||
        items.length > size ||
        (items.length === 0 && (container.totalSize ?? 0) > offset)
      )
        throw new Error("Plex returned incomplete media list data.");
      return {
        offset,
        total:
          container.totalSize ??
          (items.length < size ? offset + items.length : null),
        items: items.map((item, index) =>
          query.id
            ? itemEntry(
                item,
                offset + index,
                container.librarySectionID,
                localServer,
              )
            : listSummary(item, query.kind),
        ),
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
  const entries = page.items as MediaListEntry[];
  if (entries[0]?.item.ratingKey !== currentID)
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
