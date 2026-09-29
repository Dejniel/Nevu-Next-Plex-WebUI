import type { MediaItemData } from "entities/media/model";
import { isMatchedMetadata } from "./matching";

export interface MediaActionContext {
  localItem: boolean;
  canManageServer: boolean;
  allowDownloads: boolean;
}

export interface MediaActionCapabilities {
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
  const canEditMetadata = localItem && canManageServer;
  const canMatch = canEditMetadata && ["movie", "show"].includes(item.type);
  const similarRatingKey = item.type === "episode"
    ? item.grandparentRatingKey
    : item.ratingKey;

  return {
    canEditMetadata,
    canMatch,
    canUnmatch: canMatch && isMatchedMetadata(item),
    canDownload: localItem && allowDownloads && ["movie", "episode"].includes(item.type),
    canSetWatched: localItem,
    similarRatingKey: localItem && similarRatingKey ? similarRatingKey : null,
  };
}
