import { PlexClient } from "shared/api/PlexClient";
import { getBackendURL } from "shared/api/backend";
import { queryBuilder } from "shared/lib/query";
import { browserVideoCapabilities } from "shared/lib/video/capabilities";
import { uuidV4 } from "shared/lib/identifiers";
import type { VideoSource } from "shared/lib/video/types";

export interface MusicQueue {
  id: number;
  version: number;
  total: number;
  selected: number;
  selectedOffset: number;
  items: Plex.Metadata[];
}

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
  return {
    async create(id: string, startID?: string, shuffle = false) {
      return readMusicQueue(
        await client.post(
          `/playQueues?${params({
            type: "audio",
            uri: uri(id),
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
    async add(id: number, itemID: string, next: boolean, libraryUUID?: string) {
      return readMusicQueue(
        await client.put(
          `/playQueues/${id}?${params({ uri: libraryUUID ? `library://${libraryUUID}/item/library/metadata/${itemID}` : uri(itemID), next: Number(next) })}`,
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

export interface AudioSource extends VideoSource {
  context: Record<string, unknown>;
}

export function audioSource(
  item: Plex.Metadata,
  context: Record<string, unknown>,
  converted: boolean,
): AudioSource {
  const part = item.Media?.[0]?.Part?.[0];
  if (!part?.key) throw new Error("This track has no available audio file.");
  const id = uuidV4();
  const protocol = browserVideoCapabilities().mediaSourceSupported(
    'audio/mp4; codecs="mp4a.40.2"',
  )
    ? "dash"
    : "hls";
  const query = queryBuilder(
    converted
      ? {
          ...context,
          session: id,
          "X-Plex-Session-Identifier": id,
          path: `/library/metadata/${item.ratingKey}`,
          mediaIndex: 0,
          partIndex: 0,
          protocol,
          directPlay: 0,
          directStream: 0,
          directStreamAudio: 0,
          audioBitrate: 320,
          "X-Plex-Client-Profile-Name": "Generic",
          "X-Plex-Client-Profile-Extra": `add-transcode-target(type=musicProfile&context=streaming&protocol=${protocol}&container=${protocol === "dash" ? "mp4" : "mpegts"}&audioCodec=aac)`,
        }
      : context,
  );
  return {
    id,
    context,
    type: converted ? protocol : "file",
    stripSegmentInitialization: converted && protocol === "dash",
    url: `${getBackendURL()}/dynproxy${converted ? `/audio/:/transcode/universal/start.${protocol === "dash" ? "mpd" : "m3u8"}` : part.key}?${query}`,
  };
}

export async function releaseAudioSource(source: AudioSource) {
  if (source.type === "file") return;
  try {
    await fetch(
      `${getBackendURL()}/dynproxy/audio/:/transcode/universal/stop?${queryBuilder(
        {
          ...source.context,
          session: source.id,
          "X-Plex-Session-Identifier": source.id,
        },
      )}`,
      { keepalive: true, signal: AbortSignal.timeout(3000) },
    );
  } catch {
    /* PMS expires disconnected sessions. */
  }
}

export async function pingAudioSource(source: AudioSource) {
  if (source.type === "file") return;
  await fetch(
    `${getBackendURL()}/dynproxy/audio/:/transcode/universal/ping?${queryBuilder(
      {
        ...source.context,
        session: source.id,
        "X-Plex-Session-Identifier": source.id,
      },
    )}`,
    { signal: AbortSignal.timeout(3000) },
  );
}
