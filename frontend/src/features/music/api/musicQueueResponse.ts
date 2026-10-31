import { readMusicQueueItem } from "entities/media/model";
import {
  plexArray,
  plexBoolean,
  plexContainer,
  plexFields,
  plexInteger,
  PlexResponseError,
} from "shared/api/plexResponse";
import type { MusicQueue } from "../model/musicQueue";

/** Decode a materialized window, never a mutation's possibly incomplete acknowledgement. */
export function readMusicQueue(
  response: unknown,
  expectedID?: number,
): MusicQueue {
  const resource = "music queue";
  const container = plexContainer(response, resource);
  const integer = (value: unknown) => plexInteger(value, resource);
  const id = integer(container.playQueueID);
  const version = integer(container.playQueueVersion);
  const items = plexArray(container.Metadata, resource).map(readMusicQueueItem);
  const fields = plexFields(container, {
    size: integer,
    playQueueTotalCount: integer,
    playQueueSelectedItemID: integer,
    playQueueSelectedItemOffset: integer,
    playQueueShuffled: (value) => plexBoolean(value, resource),
  });
  // PMS omits both selection and total after removing the final item. Its
  // explicit zero-size window is evidence of an empty queue, not a failed read.
  const total =
    fields.playQueueTotalCount ?? (fields.size === 0 ? 0 : undefined);
  const selected = fields.playQueueSelectedItemID ?? null;
  const selectedOffset = fields.playQueueSelectedItemOffset ?? null;
  if (
    !id ||
    (expectedID !== undefined && id !== expectedID) ||
    total === undefined ||
    items.length > total ||
    (fields.size !== undefined && fields.size !== items.length) ||
    (total > 0
      ? !items.length ||
        !selected ||
        selectedOffset === null ||
        selectedOffset >= total
      : Boolean(selected || selectedOffset)) ||
    new Set(items.map((item) => item.playQueueItemID)).size !== items.length
  )
    throw new PlexResponseError(resource);
  return {
    id,
    version,
    total,
    selected: total ? selected : null,
    selectedOffset: total ? selectedOffset : null,
    shuffled: fields.playQueueShuffled ?? false,
    items,
  };
}
