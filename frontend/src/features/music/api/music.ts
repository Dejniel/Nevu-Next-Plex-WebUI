import type { MusicQueueItem } from "entities/media/model";
import { PlexClient, PlexRequestError } from "shared/api/PlexClient";
import { queryBuilder } from "shared/lib/query";
import type { MusicQueueSource } from "../model/musicQueue";
import { readMusicQueue } from "./musicQueueResponse";

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
  const get = async (id: number, center?: number, signal?: AbortSignal) =>
    readMusicQueue(
      await client.get(
        `/playQueues/${id}?${params({ window: 50, ...(center && { center }), includeBefore: 1, includeAfter: 1 })}`,
        signal,
      ),
      id,
    );
  // Mutation responses can acknowledge an edit before materializing its window.
  const change = async (
    id: number,
    path: string,
    method: "PUT" | "DELETE",
    values: Record<string, unknown>,
    signal?: AbortSignal,
  ) => {
    signal?.throwIfAborted();
    await client.request(
      `/playQueues/${id}${path}?${params(values)}`,
      method,
      undefined,
      signal,
    );
    signal?.throwIfAborted();
    return get(id, undefined, signal);
  };
  return {
    async create(
      source: MusicQueueSource,
      startID?: string,
      shuffle = false,
      signal?: AbortSignal,
    ) {
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
          undefined,
          signal,
        ),
      );
    },
    get,
    add(
      id: number,
      source: MusicQueueSource,
      next: boolean,
      signal?: AbortSignal,
    ) {
      return change(
        id,
        "",
        "PUT",
        { ...sourceParams(source), next: Number(next) },
        signal,
      );
    },
    remove(id: number, entryID: number, signal?: AbortSignal) {
      return change(id, `/items/${entryID}`, "DELETE", {}, signal);
    },
    move(id: number, entryID: number, after?: number, signal?: AbortSignal) {
      return change(id, `/items/${entryID}/move`, "PUT", { after }, signal);
    },
    async shuffle(id: number, enabled: boolean, signal?: AbortSignal) {
      try {
        return await change(
          id,
          enabled ? "/shuffle" : "/unshuffle",
          "PUT",
          {},
          signal,
        );
      } catch (reason) {
        if (
          !signal?.aborted &&
          reason instanceof PlexRequestError &&
          [400, 404].includes(reason.status)
        )
          throw new Error(
            "Plex could not change shuffle for this queue. Start a new shuffled selection from an album or playlist.",
          );
        throw reason;
      }
    },
    reset(id: number, signal?: AbortSignal) {
      return change(id, "/reset", "PUT", {}, signal);
    },
    async timeline(
      item: Pick<MusicQueueItem, "ratingKey" | "playQueueItemID">,
      queueID: number,
      state: string,
      time: number,
      duration: number,
      signal?: AbortSignal,
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
        signal,
      );
    },
  };
}
