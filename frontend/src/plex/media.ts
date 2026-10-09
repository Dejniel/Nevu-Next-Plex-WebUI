/** Full Plex metadata. Absence of optional data is distinct from a zero or empty value. */
export interface MediaStream {
  streamType: 1 | 2 | 3;
  id?: number;
  index?: number;
  codec?: string;
  default?: boolean;
  selected?: boolean;
  bitrate?: number;
  language?: string;
  languageTag?: string;
  languageCode?: string;
  bitDepth?: number;
  chromaLocation?: string;
  chromaSubsampling?: string;
  codedHeight?: number;
  codedWidth?: number;
  frameRate?: number;
  height?: number;
  level?: number;
  profile?: string;
  refFrames?: number;
  scanType?: string;
  title?: string;
  width?: number;
  displayTitle?: string;
  extendedDisplayTitle?: string;
  channels?: number;
  audioChannelLayout?: string;
  samplingRate?: number;
}

export interface MediaPart {
  id?: number;
  key?: string;
  duration?: number;
  file?: string;
  size?: number;
  audioProfile?: string;
  container?: string;
  indexes?: string;
  videoProfile?: string;
  Stream?: MediaStream[];
}

export interface MediaRendition {
  id?: number;
  duration?: number;
  bitrate?: number;
  width?: number;
  height?: number;
  aspectRatio?: number;
  audioChannels?: number;
  audioCodec?: string;
  videoCodec?: string;
  videoResolution?: string;
  container?: string;
  videoFrameRate?: string;
  audioProfile?: string;
  videoProfile?: string;
  videoDynamicRange?: string;
  aperture?: string;
  exposure?: string;
  iso?: number;
  lens?: string;
  make?: string;
  model?: string;
  Part?: MediaPart[];
}

interface MetadataTag {
  tag: string;
  id?: number;
  filter?: string;
}
interface MetadataRole extends MetadataTag {
  role?: string;
  tagKey?: string;
  thumb?: string;
}
interface MediaChapter {
  index: number;
  startTimeOffset: number;
  endTimeOffset: number;
  id?: number;
  filter?: string;
  thumb?: string;
}
interface MediaMarker {
  type: string;
  startTimeOffset: number;
  endTimeOffset: number;
  id?: number;
  final?: boolean;
}
interface MetadataReview {
  text: string;
  id?: number;
  filter?: string;
  tag?: string;
  image?: string;
  link?: string;
  source?: string;
}

interface MetadataFields {
  ratingKey: string;
  title: string;
  key?: string;
  guid?: string;
  Guid?: { id: string }[];
  playQueueItemID?: number;
  skipChildren?: boolean;
  parentRatingKey?: string;
  grandparentRatingKey?: string;
  slug?: string;
  studio?: string;
  titleSort?: string;
  librarySectionTitle?: string;
  librarySectionID?: number;
  librarySectionKey?: string;
  grandparentKey?: string;
  parentKey?: string;
  grandparentTitle?: string;
  parentTitle?: string;
  parentThumb?: string;
  grandparentThumb?: string;
  composite?: string;
  originalTitle?: string;
  contentRating?: string;
  summary?: string;
  index?: number;
  parentIndex?: number;
  rating?: number;
  audienceRating?: number;
  userRating?: number;
  Rating?: { value: number; image?: string; type?: string }[];
  viewOffset?: number;
  viewCount?: number;
  lastViewedAt?: number;
  year?: number;
  tagline?: string;
  thumb?: string;
  art?: string;
  theme?: string;
  duration?: number;
  originallyAvailableAt?: string;
  leafCount?: number;
  viewedLeafCount?: number;
  childCount?: number;
  seasonCount?: number;
  addedAt?: number;
  updatedAt?: number;
  audienceRatingImage?: string;
  primaryExtraKey?: string;
  extraType?: number;
  subtype?: string;
  ratingImage?: string;
  Media?: MediaRendition[];
  Genre?: MetadataTag[];
  Collection?: MetadataTag[];
  Label?: MetadataTag[];
  Producer?: MetadataTag[];
  Country?: MetadataTag[];
  Director?: MetadataTag[];
  Writer?: MetadataTag[];
  Role?: MetadataRole[];
  Field?: { name: string; locked: boolean }[];
  OnDeck?: { Metadata?: MediaMetadata };
  Children?: { size?: number; Metadata?: MediaMetadata[] };
  Extras?: { size?: number; Metadata?: MediaMetadata[] };
  Image?: { alt?: string; type: string; url: string }[];
  UltraBlurColors?: {
    topLeft: string;
    topRight: string;
    bottomLeft: string;
    bottomRight: string;
  };
  Related?: { Hub?: { Metadata?: MediaMetadata[] }[] };
  Review?: MetadataReview[];
}

interface VideoMetadata extends MetadataFields {
  type: "movie" | "show" | "season" | "episode" | "clip";
  chapterSource?: string;
  Chapter?: MediaChapter[];
  Marker?: MediaMarker[];
}
interface MusicMetadata extends MetadataFields {
  type: "artist" | "album" | "track";
  Style?: MetadataTag[];
  Mood?: MetadataTag[];
  Similar?: MetadataTag[];
}
interface PhotoMetadata extends MetadataFields {
  type: "photo" | "photoalbum";
  Tag?: MetadataTag[];
}
export type MediaMetadata = VideoMetadata | MusicMetadata | PhotoMetadata;
