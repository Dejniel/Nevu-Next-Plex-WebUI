import { useQuery } from "@tanstack/react-query";
import { getActiveServerScope, useActiveServerScope, useAuthSession } from "features/session/model";
import { serverQueryClient } from "shared/api/queryClient";
import {
  getTrackChoices,
  mediaMetadataQueryOptions,
  mediaChildrenQueryOptions,
  mediaGuidQueryOptions,
} from "entities/media/model";
import { type Dispatch, type SetStateAction, useCallback, useEffect, useState } from "react";

export function selectInitialSeason(data: Plex.Metadata) {
  const onDeckSeason = data.OnDeck?.Metadata?.parentIndex;
  if (typeof onDeckSeason === "number") return onDeckSeason;

  return (
    [...(data.Children?.Metadata || [])]
      .filter((season) => season.index !== 0)
      .sort((left, right) => left.index - right.index)[0]?.index ?? 1
  );
}

export function trackLanguages(data: Plex.Metadata, streamType: 2 | 3) {
  return Array.from(
    new Set(
      getTrackChoices(data, streamType)
        .map(({ stream }) => stream.language || stream.displayTitle)
        .filter((language): language is string => Boolean(language)),
    ),
  );
}

export function useTitleDetailsData(mediaID: string | null, plexGuid: string | null) {
  const scope = useActiveServerScope();
  const revision = useAuthSession((state) => state.revision);
  const ready = Boolean(scope.serverId && scope.profileKey);
  const metadataOptions = mediaMetadataQueryOptions(scope, mediaID ?? "");
  const metadata = useQuery(
    { ...metadataOptions, enabled: ready && Boolean(mediaID) },
    serverQueryClient,
  );
  const resolution = useQuery(
    {
      ...mediaGuidQueryOptions(scope, plexGuid ?? ""),
      enabled: ready && !mediaID && Boolean(plexGuid),
    },
    serverQueryClient,
  );
  const data = metadata.data;
  const identity = JSON.stringify([...metadataOptions.queryKey, revision]);
  const [season, setSeason] = useState({ identity: "", index: 0 });
  const selectedSeason =
    season.identity === identity ? season.index : data ? selectInitialSeason(data) : 0;
  useEffect(() => {
    if (data && season.identity !== identity)
      setSeason({ identity, index: selectInitialSeason(data) });
  }, [data, identity, season.identity]);
  const setSelectedSeason = useCallback<Dispatch<SetStateAction<number>>>(
    (value) => {
      setSeason((previous) => ({
        identity,
        index:
          typeof value === "function"
            ? value(previous.identity === identity ? previous.index : selectedSeason)
            : value,
      }));
    },
    [identity, selectedSeason],
  );
  const selectedSeasonId = data?.Children?.Metadata?.find(
    (item) => item.index === selectedSeason,
  )?.ratingKey;
  const isShow = data?.type === "show";
  const children = useQuery(
    {
      ...mediaChildrenQueryOptions(scope, selectedSeasonId ?? ""),
      enabled: ready && isShow && Boolean(selectedSeasonId),
    },
    serverQueryClient,
  );
  const episodes = !isShow
    ? null
    : !selectedSeasonId
      ? []
      : (children.data ?? (children.isError ? [] : null));
  const firstEpisodeId = episodes?.[0]?.ratingKey;
  const episodeMetadata = useQuery(
    {
      ...mediaMetadataQueryOptions(scope, firstEpisodeId ?? ""),
      enabled: ready && isShow && Boolean(firstEpisodeId),
    },
    serverQueryClient,
  );
  const tracks = data?.type === "movie" ? data : isShow ? episodeMetadata.data : undefined;
  const trackList = (type: 2 | 3) =>
    tracks
      ? trackLanguages(tracks, type)
      : isShow && (episodes?.length === 0 || episodeMetadata.isError)
        ? []
        : null;
  const setData = useCallback<Dispatch<SetStateAction<Plex.Metadata | undefined>>>(
    (update) => {
      const active = getActiveServerScope();
      if (
        active?.serverId !== scope.serverId ||
        active?.profileKey !== scope.profileKey ||
        useAuthSession.getState().revision !== revision
      )
        return;
      const key = mediaMetadataQueryOptions(scope, mediaID ?? "").queryKey;
      void serverQueryClient.cancelQueries({ queryKey: key, exact: true });
      serverQueryClient.setQueryData<Plex.Metadata>(key, update);
    },
    [scope, mediaID, revision],
  );
  const loadError = mediaID
    ? metadata.isError && !data
      ? "Could not load this title from the Plex server."
      : null
    : resolution.isError
      ? "Could not resolve this title on the Plex server."
      : resolution.isSuccess && !resolution.data
        ? "This title is not available on this Plex server."
        : null;
  return {
    data,
    episodes,
    languages: trackList(2),
    subtitles: trackList(3),
    loadError,
    loading: Boolean(mediaID || plexGuid) && (mediaID ? metadata.isPending : resolution.isPending),
    resolvedRatingKey: !mediaID ? (resolution.data?.ratingKey.toString() ?? null) : null,
    selectedSeason,
    setSelectedSeason,
    setData,
    refetchEpisodes: () => {
      void children.refetch();
    },
  };
}
