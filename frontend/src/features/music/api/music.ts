import { PlexClient } from "shared/api/PlexClient";
import { queryBuilder } from "shared/lib/query";

export interface MusicQueue {
  id: number;
  version: number;
  total: number;
  selected: number;
  selectedOffset: number;
  items: Plex.Metadata[];
}

export type MusicQueueSource =
  | { kind: "library"; id: string; libraryUUID?: string }
  | { kind: "playlist"; id: string };

export function readMusicQueue(response: {
  MediaContainer?: {
    playQueueID: number;
    playQueueVersion: number;
    playQueueTotalCount: number;
    playQueueSelectedItemID: number;
    playQueueSelectedItemOffset: number;
    Metadata?: Plex.Metadata[];
  };
}): MusicQueue {
  const data = response.MediaContainer;
  if (
    !data ||
    !Number.isSafeInteger(data.playQueueID) ||
    data.playQueueID <= 0 ||
    !Number.isSafeInteger(data.playQueueTotalCount)
  )
    throw new Error("Plex returned an invalid music queue.");
  const items = data.Metadata ?? [];
  if (
    !Array.isArray(items) ||
    items.some((item) => item.type !== "track" || !item.playQueueItemID)
  )
    throw new Error("Plex returned an invalid music queue.");
  if (new Set(items.map((item) => item.playQueueItemID)).size !== items.length)
    throw new Error("Plex returned duplicate music queue entries.");
  return {
    id: data.playQueueID,
    version: data.playQueueVersion,
    total: data.playQueueTotalCount,
    selected: data.playQueueSelectedItemID,
    selectedOffset: data.playQueueSelectedItemOffset,
    items,
  };
}

export function musicAPI(context: Record<string, unknown>, serverID: string) {
  const client = new PlexClient(() => String(context["X-Plex-Token"] ?? ""));
  const uri = (id: string) =>
    `server://${serverID}/com.plexapp.plugins.library/library/metadata/${id}`;
  const params = (values: Record<string, unknown>) =>
    queryBuilder({ ...context, ...values });
  const sourceParams = (source: MusicQueueSource) =>
    source.kind === "playlist"
      ? { playlistID: source.id }
      : {
          uri: source.libraryUUID
            ? `library://${source.libraryUUID}/item/library/metadata/${source.id}`
            : uri(source.id),
        };
  return {
    async create(source: MusicQueueSource, startID?: string, shuffle = false) {
      return readMusicQueue(
        await client.post(
          `/playQueues?${params({
            type: "audio",
            ...sourceParams(source),
            ...(startID && { key: `/library/metadata/${startID}` }),
            shuffle: Number(shuffle),
            continuous: 0,
            includeRelated: 0,
            window: 50,
          })}`,
        ),
      );
    },
    async get(id: number, center?: number, signal?: AbortSignal) {
      return readMusicQueue(
        await client.get(
          `/playQueues/${id}?${params({
            window: 50,
            ...(center && { center }),
            includeBefore: 1,
            includeAfter: 1,
          })}`,
          signal,
        ),
      );
    },
    async add(id: number, source: MusicQueueSource, next: boolean) {
      return readMusicQueue(
        await client.put(
          `/playQueues/${id}?${params({ ...sourceParams(source), next: Number(next) })}`,
        ),
      );
    },
    async remove(id: number, entryID: number) {
      return readMusicQueue(
        await client.delete(`/playQueues/${id}/items/${entryID}?${params({})}`),
      );
    },
    async move(id: number, entryID: number, after?: number) {
      return readMusicQueue(
        await client.put(
          `/playQueues/${id}/items/${entryID}/move?${params({ after })}`,
        ),
      );
    },
    async timeline(
      item: Plex.Metadata,
      queueID: number,
      state: string,
      time: number,
      duration: number,
    ) {
      await client.get(
        `/:/timeline?${params({
          ratingKey: item.ratingKey,
          key: `/library/metadata/${item.ratingKey}`,
          identifier: "com.plexapp.plugins.library",
          playQueueID: queueID,
          playQueueItemID: item.playQueueItemID,
          state,
          time: Math.floor(time * 1000),
          duration: Math.floor(duration * 1000),
          context: "library",
        })}`,
      );
    },
  };
}
