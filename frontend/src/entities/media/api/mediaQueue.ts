import {
  plexObject,
  plexFields,
  plexString,
  plexInteger,
  PlexResponseError,
} from "shared/api/plexResponse";
import type { PlaybackQueueItem, MusicQueueItem } from "../model/mediaQueue";

function queueFields(row: Record<string, unknown>, resource: string) {
  const text = (value: unknown) => plexString(value, resource);
  const integer = (value: unknown) => plexInteger(value, resource);
  const occurrence = (value: unknown) => {
    const id = integer(value);
    if (!id) throw new PlexResponseError(resource);
    return id;
  };
  const ratingKey = text(row.ratingKey);
  if (!/^\d+$/.test(ratingKey)) throw new PlexResponseError(resource);
  return {
    ratingKey,
    title: text(row.title),
    ...plexFields(row, {
      summary: text,
      thumb: text,
      index: integer,
      viewOffset: integer,
      playlistItemID: occurrence,
      playQueueItemID: occurrence,
    }),
  };
}

export function readPlaybackQueueItem(value: unknown): PlaybackQueueItem {
  const resource = "playback queue";
  const row = plexObject(value, resource);
  const type = row.type;
  if (type !== "movie" && type !== "episode" && type !== "clip")
    throw new PlexResponseError(resource);
  return { ...queueFields(row, resource), type };
}

export function readMusicQueueItem(value: unknown): MusicQueueItem {
  const resource = "music queue";
  const row = plexObject(value, resource);
  const fields = queueFields(row, resource);
  if (row.type !== "track" || fields.playQueueItemID === undefined)
    throw new PlexResponseError(resource);
  return {
    ...fields,
    type: "track",
    playQueueItemID: fields.playQueueItemID,
    ...plexFields(row, {
      duration: (value) => plexInteger(value, resource),
      grandparentTitle: (value) => plexString(value, resource),
    }),
  };
}
