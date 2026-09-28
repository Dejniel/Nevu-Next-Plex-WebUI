export type LibraryItemType = "movie" | "show" | "episode";

export type LibrarySort = string;

export type LibrarySource = "all" | "onDeck";

export type LibraryFilterMode = "and" | "or";

export type LibraryFilterOperator =
  | "="
  | "!="
  | "=="
  | "!=="
  | "<="
  | ">="
  | "<<="
  | ">>=";

export interface LibraryFilterClause {
  field: string;
  operator: LibraryFilterOperator;
  value: string;
  valueLabel?: string;
}

export interface LibraryFilterLeaf extends LibraryFilterClause {
  kind: "clause";
}

export interface LibraryFilterGroup {
  kind: "group";
  mode: LibraryFilterMode;
  children: LibraryFilterExpression[];
}

export type LibraryFilterExpression = LibraryFilterLeaf | LibraryFilterGroup;

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
  source?: LibrarySource;
  type?: LibraryItemType;
  sort: LibrarySort;
  filterExpression?: LibraryFilterExpression;
  offset: number;
  size: number;
  seed?: string;
  refresh?: boolean;
}

export interface LibraryPageDto {
  offset: number;
  size: number;
  totalSize: number | null;
  hasMore: boolean;
  generationId?: string;
  items: LibraryCardDto[];
}
