export type LibraryFilter =
  | "all"
  | "unwatched"
  | "watched"
  | "recentlyAdded"
  | "onDeck"
  | "newest";

export type LibraryItemType = "movie" | "show" | "episode";

export type LibrarySort =
  | "title:asc"
  | "title:desc"
  | "addedAt:asc"
  | "addedAt:desc"
  | "year:asc"
  | "year:desc"
  | "updated:asc"
  | "updated:desc"
  | "random:desc";

export interface LibraryGenreDto {
  id?: number;
  tag: string;
}

export interface LibraryMediaDto {
  bitrate?: number;
  height?: number;
  videoDynamicRange?: string;
  videoResolution?: string;
  width?: number;
}

export interface LibraryCardDto {
  ratingKey: string;
  key?: string;
  guid: string;
  type: LibraryItemType;
  title: string;
  parentTitle?: string;
  grandparentTitle?: string;
  parentRatingKey?: string;
  grandparentRatingKey?: string;
  parentIndex?: number;
  index?: number;
  year?: number;
  duration?: number;
  seasonCount?: number;
  childCount?: number;
  thumb?: string;
  art?: string;
  audienceRating?: number;
  rating?: number;
  viewCount?: number;
  viewOffset?: number;
  viewedLeafCount?: number;
  leafCount?: number;
  Genre?: LibraryGenreDto[];
  Media?: LibraryMediaDto[];
}

export interface LibraryPageRequest {
  sectionId: number;
  filter: LibraryFilter;
  type?: LibraryItemType;
  sort: LibrarySort;
  offset: number;
  size: number;
  seed?: string;
}

export interface LibraryPageDto {
  offset: number;
  size: number;
  totalSize: number | null;
  hasMore: boolean;
  viewGroup?: string;
  title?: string;
  items: LibraryCardDto[];
}
