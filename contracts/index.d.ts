export * from "./preferences.js";

export type LibraryVideoType = "movie" | "show" | "episode";
export type LibraryMusicType = "artist" | "album" | "track";
export type LibraryPhotoType = "photoalbum" | "photo";
export type LibraryItemType =
  | LibraryVideoType
  | LibraryMusicType
  | LibraryPhotoType
  | "clip";
export const libraryItemTypeNumbers: Readonly<Record<LibraryItemType, number>>;
export function isLibraryItemType(value: unknown): value is LibraryItemType;
export function isVideoLibraryItemType(
  value: unknown,
): value is LibraryVideoType;
export function isLibraryContainerType(
  value: unknown,
): value is "show" | "artist" | "album" | "photoalbum";

export type LibrarySort = string;

export type LibrarySource = "all" | "onDeck" | "children";

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

export interface LibraryVideoMediaDto {
  bitrate?: number;
  height?: number;
  videoDynamicRange?: string;
  videoResolution?: string;
  width?: number;
}

export interface LibraryCardBase {
  ratingKey: string;
  key?: string;
  guid?: string;
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
  parentThumb?: string;
  grandparentThumb?: string;
  parentIndex?: number;
  index?: number;
  year?: number;
  thumb?: string;
  art?: string;
  audienceRating?: number;
  audienceRatingImage?: string;
  rating?: number;
  ratingImage?: string;
  Genre?: LibraryGenreDto[];
  Collection?: LibraryGenreDto[];
}

export interface LibraryVideoCardDto extends LibraryCardBase {
  type: LibraryVideoType;
  guid: string;
  duration?: number;
  seasonCount?: number;
  childCount?: number;
  viewCount?: number;
  viewOffset?: number;
  viewedLeafCount?: number;
  leafCount?: number;
  Media?: LibraryVideoMediaDto[];
}

export interface LibraryMusicCardDto extends LibraryCardBase {
  type: LibraryMusicType;
  duration?: number;
  childCount?: number;
  leafCount?: number;
  viewCount?: number;
  Media?: {
    audioCodec?: string;
    audioChannels?: number;
    bitrate?: number;
    container?: string;
  }[];
}

export interface LibraryPhotoCardDto extends LibraryCardBase {
  type: LibraryPhotoType;
  childCount?: number;
  leafCount?: number;
  composite?: string;
  Media?: { width?: number; height?: number; container?: string }[];
}

/** Video clips may occur alongside photos in a Plex photo album. */
export interface LibraryClipCardDto extends LibraryCardBase {
  type: "clip";
  duration?: number;
  viewOffset?: number;
  Media?: LibraryVideoMediaDto[];
}

export type LibraryCardDto =
  | LibraryVideoCardDto
  | LibraryMusicCardDto
  | LibraryPhotoCardDto
  | LibraryClipCardDto;

export function libraryFieldsUnaffected(
  field: string,
  changed: readonly string[],
): boolean;
export function mediaFieldsUnaffected(
  field: string,
  changed: readonly string[],
): boolean;
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
  parentId?: string;
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

export function normalizeLibraryRecord<
  T extends { type?: string; key?: string },
>(item: T, directory?: boolean, requestedType?: LibraryItemType): T;
