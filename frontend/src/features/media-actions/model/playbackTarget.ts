import {
  mediaGuidQueryOptions,
  mediaChildrenQueryOptions,
  mediaMetadataQueryOptions,
  type MediaItemData,
} from "entities/media/model";
import { getActiveServerScope, useAuthSession } from "features/session/model";
import { serverQueryClient } from "shared/api/queryClient";
import { mediaWatchTo } from "shared/lib/navigation";

export type PlaybackTarget =
  { path: string; item: Plex.Metadata | MediaItemData } | { path: null; message: string };

export async function resolvePlaybackTarget(
  item: MediaItemData,
  plexTvSource = false,
): Promise<PlaybackTarget> {
  if (!plexTvSource && (item.type === "movie" || item.type === "episode"))
    return { path: mediaWatchTo(item), item };
  const scope = getActiveServerScope();
  if (!scope) throw new Error("No active Plex server.");
  const revision = useAuthSession.getState().revision;
  const assertCurrent = () => {
    const active = getActiveServerScope();
    if (
      revision !== useAuthSession.getState().revision ||
      active?.serverId !== scope.serverId ||
      active?.profileKey !== scope.profileKey
    )
      throw new Error("The active Plex session changed.");
  };
  const localItem = plexTvSource
    ? await serverQueryClient.fetchQuery(mediaGuidQueryOptions(scope, item.guid))
    : item;
  assertCurrent();
  if (!localItem)
    return {
      path: null,
      message: `"${item.title}" is not available on this Plex server.`,
    };

  if (localItem.type === "movie" || localItem.type === "episode")
    return { path: mediaWatchTo(localItem), item: localItem };

  if (localItem.type !== "show")
    return { path: null, message: "This media type cannot be played yet." };

  const show = await serverQueryClient.fetchQuery({
    ...mediaMetadataQueryOptions(scope, localItem.ratingKey),
    // On Deck determines the episode started by this action; read its current state.
    staleTime: 0,
  });
  assertCurrent();
  if (show.OnDeck?.Metadata)
    return {
      path: mediaWatchTo(show.OnDeck.Metadata),
      item: show.OnDeck.Metadata,
    };

  const firstSeason = show.Children?.Metadata?.[0];
  if (!firstSeason?.ratingKey)
    return { path: null, message: `"${item.title}" has no playable episodes.` };

  const [firstEpisode] = await serverQueryClient.fetchQuery(
    mediaChildrenQueryOptions(scope, firstSeason.ratingKey),
  );
  assertCurrent();
  if (!firstEpisode) return { path: null, message: `"${item.title}" has no playable episodes.` };

  return { path: mediaWatchTo(firstEpisode), item: firstEpisode };
}
