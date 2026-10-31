import type { MusicQueueItem } from "entities/media/model";

/** One native queue window; selection can belong to a different window. */
export interface MusicQueue {
  id: number;
  version: number;
  total: number;
  selected: number | null;
  selectedOffset: number | null;
  shuffled: boolean;
  items: MusicQueueItem[];
}

export type MusicQueueSource =
  | { kind: "library"; id: string; libraryUUID?: string }
  | { kind: "playlist"; id: string };
