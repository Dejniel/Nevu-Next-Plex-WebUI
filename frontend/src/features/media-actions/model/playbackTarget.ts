import {
  getMediaByGuid,
  getMediaChildren,
  getMediaMetadata,
  type MediaItemData,
} from "entities/media/model";
import { mediaWatchTo } from "shared/lib/navigation";

export type PlaybackTarget =
  | { path: string; item: Plex.Metadata | MediaItemData }
  | { path: null; message: string };

export async function resolvePlaybackTarget(
  item: MediaItemData,
  plexTvSource = false,
): Promise<PlaybackTarget> {
  const localItem = plexTvSource ? await getMediaByGuid(item.guid) : item;
  if (!localItem)
    return {
      path: null,
      message: `"${item.title}" is not available on this Plex server.`,
    };

  if (localItem.type === "movie" || localItem.type === "episode")
    return { path: mediaWatchTo(localItem), item: localItem };

  if (localItem.type !== "show")
    return { path: null, message: "This media type cannot be played yet." };

  const show = await getMediaMetadata(localItem.ratingKey);
  if (show.OnDeck?.Metadata)
    return { path: mediaWatchTo(show.OnDeck.Metadata), item: show.OnDeck.Metadata };

  const firstSeason = show.Children?.Metadata?.[0];
  if (!firstSeason?.ratingKey)
    return { path: null, message: `"${item.title}" has no playable episodes.` };

  const [firstEpisode] = await getMediaChildren(firstSeason.ratingKey);
  if (!firstEpisode)
    return { path: null, message: `"${item.title}" has no playable episodes.` };

  return { path: mediaWatchTo(firstEpisode), item: firstEpisode };
}
