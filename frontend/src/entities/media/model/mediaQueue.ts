/** Navigation/preview data for a queue occurrence, never a full media snapshot. */
interface QueueItemFields {
  ratingKey: string;
  title: string;
  summary?: string;
  thumb?: string;
  index?: number;
  viewOffset?: number;
  playlistItemID?: number;
  playQueueItemID?: number;
}

export interface PlaybackQueueItem extends QueueItemFields {
  type: "movie" | "episode" | "clip";
}

export interface MusicQueueItem extends QueueItemFields {
  type: "track";
  playQueueItemID: number;
  duration?: number;
  grandparentTitle?: string;
}
