export { mediaArtworkPath } from "./model/mediaArtwork";
export { getIncludeProps } from "./model/mediaIncludes";
export {
  DETAIL_POSTER_IMAGE_WIDTHS,
  getResponsiveTranscodeImageProps,
  getTranscodeImageURL,
  HERO_IMAGE_WIDTHS,
  LANDSCAPE_IMAGE_WIDTHS,
  POSTER_IMAGE_WIDTHS,
  transcodeHeight,
} from "./model/mediaImages";
export {
  getMediaByGuid,
  getMediaChildren,
  getMediaMetadata,
  setMediaPlayedStatus,
} from "./api/media";
export {
  chooseBestMediaVersion,
  findPreferredStream,
  getMediaVersions,
  getTrackChoices,
  mediaQualityBadge,
  mediaVersionDetails,
  parseTrackPreference,
  preferenceFromStream,
} from "./model/mediaVersions";
export type { MediaVersion, TrackChoice, TrackPreference } from "./model/mediaVersions";
export type { MediaItemData } from "./model/media";
export {
  matchesMediaScope,
  publishMediaChange,
  subscribeToMediaChanges,
} from "./model/mediaChanges";
export {
  mediaMetadataQueryKey,
  mediaMetadataQueryOptions,
  mediaChildrenQueryKey,
  mediaChildrenQueryOptions,
  mediaGuidQueryOptions,
  readMediaQueryKey,
} from "./model/mediaMetadataQuery";
export { applyMediaDetailsChanges, hasCachedChildMedia } from "./model/mediaDetailsSync";
export type {
  MediaChange,
  MediaScope,
  ReconciledMediaChange,
  SynchronizationDecision,
} from "./model/mediaChanges";
export { applyMediaWatchedState, isMediaWatched } from "./model/mediaWatchedState";
export { pingMediaPlayback } from "./api/mediaPlayback";
export { useMediaPlaybackSource } from "./model/useMediaPlaybackSource";
export type { PlexPlaybackSource } from "./model/mediaPlayback";
export { fetchDiscoverExtras } from "./api/mediaExtras";
export {
  getDiscoverID,
  mergeTitleExtras,
  selectPrimaryTrailer,
  withoutExtra,
  extraTypeLabel,
} from "./model/mediaExtras";
export type { TitleExtra } from "./model/mediaExtras";
export {
  indexMediaAvailability,
  isMediaInLibrary,
  selectLocalMedia,
} from "./model/mediaAvailability";
export type { MediaAvailability } from "./model/mediaAvailability";
export { useMediaAvailability } from "./model/useMediaAvailability";
export { applyAvailabilityChanges, hasCachedAvailableMedia } from "./model/availabilitySync";
export { availabilityQueryOptions } from "./model/availabilityQuery";

export { mediaExtrasQueryOptions } from "./model/mediaExtrasQuery";
