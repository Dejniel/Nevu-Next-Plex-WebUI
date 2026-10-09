import type { MediaItemData } from "entities/media/model";
import { isVideoLibraryItemType } from "@nevu/contracts";
import { isMatchedMetadata, metadataMatchType } from "./matching";
import { supportsMetadataEditing } from "./metadataEditing";
import {
  getMediaListCapabilities,
  type MediaListCapabilities,
} from "features/media-lists/model";

export interface MediaActionContext {
  localItem: boolean;
  canManageServer: boolean;
  allowDownloads: boolean;
}

export interface MediaActionCapabilities extends MediaListCapabilities {
  canEditMetadata: boolean;
  canMatch: boolean;
  canUnmatch: boolean;
  canDownload: boolean;
  canRate: boolean;
  canSetWatched: boolean;
  similarRatingKey: string | null;
}

export function getMediaActionCapabilities(
  item: MediaItemData,
  { localItem, canManageServer, allowDownloads }: MediaActionContext,
): MediaActionCapabilities {
  const video = isVideoLibraryItemType(item.type);
  const canEditMetadata = localItem && /^\d+$/.test(item.ratingKey) && canManageServer && supportsMetadataEditing(item.type);
  const canMatch = canEditMetadata && metadataMatchType(item.type) !== undefined;
  const similarRatingKey =
    item.type === "episode" ? item.grandparentRatingKey : item.ratingKey;

  return {
    ...getMediaListCapabilities(item, { localItem, canManageServer }),
    canEditMetadata,
    canMatch,
    canUnmatch: canMatch && isMatchedMetadata(item),
    canDownload:
      localItem &&
      allowDownloads &&
      ["movie", "episode", "track", "photo", "clip"].includes(item.type),
    canRate:
      localItem &&
      Boolean(item.ratingKey) &&
      (video ||
        ["artist", "album", "track", "photoalbum", "photo", "clip"].includes(
          item.type,
        )),
    canSetWatched: localItem && video,
    similarRatingKey:
      localItem && isVideoLibraryItemType(item.type) && similarRatingKey
        ? similarRatingKey
        : null,
  };
}
