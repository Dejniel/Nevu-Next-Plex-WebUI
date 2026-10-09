/** Navigation/preview data for a queue occurrence, never a full media snapshot. */
export interface PlaybackQueueItem {
  ratingKey: string;
  type: string;
  title: string;
  summary?: string;
  thumb?: string;
  index?: number;
  viewOffset?: number;
  playlistItemID?: number;
  playQueueItemID?: number;
}
