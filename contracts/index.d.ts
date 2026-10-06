export type LibraryItemType = "movie" | "show" | "episode";

export type LibrarySort = string;

export type LibrarySource = "all" | "onDeck";

export type LibraryFilterMode = "and" | "or";

export type LibraryFilterOperator = "=" | "!=" | "==" | "!==" | "<=" | ">=" | "<<=" | ">>=";

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
  titleSort?: string;
  librarySectionID?: number;
  addedAt?: number;
  updatedAt?: number;
  lastViewedAt?: number;
  originallyAvailableAt?: string;
  studio?: string;
  contentRating?: string;
  userRating?: number;
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
  Collection?: LibraryGenreDto[];
  Media?: LibraryMediaDto[];
}

export function libraryFieldsUnaffected(field: string, changed: readonly string[]): boolean;
export function mediaFieldsUnaffected(field: string, changed: readonly string[]): boolean;
export function libraryFilterUnaffected(
  filter: LibraryFilterExpression | undefined,
  changed: readonly string[],
): boolean;
export function changedMediaFields(before: object, after: object): string[];
export interface LibraryItemUpdateDto {
  item: LibraryCardDto | null;
  metadata?: unknown;
  sectionId?: string;
  parentIds?: string[];
}
export const mediaMetadataIncludes: Readonly<Record<string, 1>>;

export interface LibraryPageRequest {
  sectionId: number;
  source?: LibrarySource;
  type?: LibraryItemType;
  sort: LibrarySort;
  filterExpression?: LibraryFilterExpression;
  offset: number;
  size: number;
  seed?: string;
}

export interface LibraryPageDto {
  offset: number;
  size: number;
  totalSize: number | null;
  hasMore: boolean;
  generationId?: string;
  items: LibraryCardDto[];
}
