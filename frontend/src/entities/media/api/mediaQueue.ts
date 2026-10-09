import { plexObject, PlexResponseError } from "shared/api/plexResponse";
import type { PlaybackQueueItem } from "../model/mediaQueue";

export function readPlaybackQueueItem(value: unknown): PlaybackQueueItem {
  const resource = "playback queue";
  const item = plexObject(value, resource);
  if (
    typeof item.ratingKey !== "string" ||
    !/^\d+$/.test(item.ratingKey) ||
    typeof item.type !== "string" ||
    !["movie", "episode", "clip"].includes(item.type) ||
    typeof item.title !== "string" ||
    ["summary", "thumb"].some(
      (field) => item[field] !== undefined && typeof item[field] !== "string",
    ) ||
    ["index", "viewOffset", "playlistItemID", "playQueueItemID"].some(
      (field) =>
        item[field] !== undefined &&
        (!Number.isSafeInteger(item[field]) ||
          Number(item[field]) < (field.endsWith("ItemID") ? 1 : 0)),
    )
  )
    throw new PlexResponseError(resource);
  return {
    ratingKey: item.ratingKey,
    type: item.type,
    title: item.title,
    ...(item.summary !== undefined && { summary: item.summary as string }),
    ...(item.thumb !== undefined && { thumb: item.thumb as string }),
    ...(item.index !== undefined && { index: item.index as number }),
    ...(item.viewOffset !== undefined && {
      viewOffset: item.viewOffset as number,
    }),
    ...(item.playlistItemID !== undefined && {
      playlistItemID: item.playlistItemID as number,
    }),
    ...(item.playQueueItemID !== undefined && {
      playQueueItemID: item.playQueueItemID as number,
    }),
  };
}
