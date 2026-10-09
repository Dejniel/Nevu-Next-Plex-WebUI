import { useQuery } from "@tanstack/react-query";
import {
  type MediaMetadata,
  mediaChildrenQueryOptions,
} from "entities/media/model";
import { useActiveServerScope, useAuthSession } from "features/session/model";
import { useEffect, useState } from "react";
import { serverQueryClient } from "shared/api/queryClient";

export function selectInitialSeason(data: MediaMetadata) {
  const seasons = data.Children?.Metadata ?? [];
  const nextEpisode = data.OnDeck?.Metadata;
  const onDeck = seasons.find(
    (season) =>
      season.ratingKey === nextEpisode?.parentRatingKey ||
      (nextEpisode?.parentIndex !== undefined &&
        season.index === nextEpisode.parentIndex),
  );
  return (
    onDeck ??
    [...seasons].sort(
      (a, b) =>
        Number(a.index === 0) - Number(b.index === 0) ||
        (a.index ?? Number.MAX_SAFE_INTEGER) -
          (b.index ?? Number.MAX_SAFE_INTEGER),
    )[0]
  );
}

/** Query owns the episode response; only the chosen season is local UI state. */
export function useTitleEpisodes(data: MediaMetadata | undefined) {
  const scope = useActiveServerScope();
  const revision = useAuthSession((state) => state.revision);
  const titleIdentity = JSON.stringify([
    scope.serverId,
    scope.profileKey,
    revision,
    data?.ratingKey,
  ]);
  const [chosen, setChosen] = useState({ titleIdentity: "", id: "" });
  const seasons = data?.type === "show" ? (data.Children?.Metadata ?? []) : [];
  const selected =
    (chosen.titleIdentity === titleIdentity
      ? seasons.find((season) => season.ratingKey === chosen.id)
      : undefined) ??
    (data?.type === "show" ? selectInitialSeason(data) : undefined);
  const seasonId = selected?.ratingKey ?? "";
  useEffect(() => {
    if (
      data?.type === "show" &&
      (chosen.titleIdentity !== titleIdentity || chosen.id !== seasonId)
    )
      setChosen({ titleIdentity, id: seasonId });
  }, [data?.type, titleIdentity, seasonId, chosen.titleIdentity, chosen.id]);
  const query = useQuery(
    {
      ...mediaChildrenQueryOptions(scope, seasonId),
      enabled: Boolean(scope.serverId && scope.profileKey && seasonId),
    },
    serverQueryClient,
  );
  return {
    identity: JSON.stringify([titleIdentity, seasonId]),
    scope,
    revision,
    seasons,
    seasonId,
    selectSeason: (id: string) => setChosen({ titleIdentity, id }),
    episodes: query.data ?? [],
    loading: Boolean(seasonId) && query.isPending,
    error: query.isError
      ? "Could not load episodes from the Plex server."
      : null,
    retry: () => {
      void query.refetch();
    },
  };
}

export type TitleEpisodesModel = ReturnType<typeof useTitleEpisodes>;
