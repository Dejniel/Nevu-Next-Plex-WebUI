import type { MediaItemData } from "entities/media/model";
import { isVideoLibraryItemType } from "@nevu/contracts";
import { isMatchedMetadata } from "./matching";
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
  canSetWatched: boolean;
  similarRatingKey: string | null;
}

export function getMediaActionCapabilities(
  item: MediaItemData,
  { localItem, canManageServer, allowDownloads }: MediaActionContext,
): MediaActionCapabilities {
  const video = isVideoLibraryItemType(item.type) || item.type === "season";
  const canEditMetadata = localItem && canManageServer && video;
  const canMatch = canEditMetadata && ["movie", "show"].includes(item.type);
  const similarRatingKey =
    item.type === "episode" ? item.grandparentRatingKey : item.ratingKey;

  return {
    ...getMediaListCapabilities(item, { localItem, canManageServer }),
    canEditMetadata,
    canMatch,
    canUnmatch: canMatch && isMatchedMetadata(item),
    canDownload:
      localItem && allowDownloads && ["movie", "episode"].includes(item.type),
    canSetWatched: localItem && video,
    similarRatingKey: localItem && isVideoLibraryItemType(item.type) && similarRatingKey ? similarRatingKey : null,
  };
}
