import { useQuery } from "@tanstack/react-query";
import { useAuthSession, useServerSession, plexProfileKey } from "features/session/model";
import { serverQueryClient } from "shared/api/queryClient";
import {
  getMediaByGuid,
  getMediaChildren,
  getMediaMetadata,
  getTrackChoices,
  mediaMetadataQueryKey,
  mediaMetadataQueryOptions,
} from "entities/media/model";
import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

interface TitleDetailsData {
  data: Plex.Metadata | undefined;
  episodes: Plex.Metadata[] | null;
  languages: string[] | null;
  loadError: string | null;
  loading: boolean;
  refetchEpisodes: () => void;
  resolvedRatingKey: string | null;
  selectedSeason: number;
  setData: Dispatch<SetStateAction<Plex.Metadata | undefined>>;
  setSelectedSeason: Dispatch<SetStateAction<number>>;
  subtitles: string[] | null;
}

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

export function useTitleDetailsData(
  mediaID: string | null,
  plexGuid: string | null,
): TitleDetailsData {
  const serverId = useServerSession((state) => state.server?.machineIdentifier) ?? "";
  const profileKey =
    useAuthSession((state) => plexProfileKey(state.ownerUser, state.activeProfile)) ?? "";
  const metadataKey = useMemo(
    () => mediaMetadataQueryKey({ serverId, profileKey }, mediaID ?? ""),
    [serverId, profileKey, mediaID],
  );
  const metadata = useQuery(
    {
      ...mediaMetadataQueryOptions({ serverId, profileKey }, mediaID ?? ""),
      enabled: Boolean(serverId && profileKey && mediaID),
    },
    serverQueryClient,
  );
  const data = metadata.data;
  const setData = useCallback<Dispatch<SetStateAction<Plex.Metadata | undefined>>>(
    (update) => {
      serverQueryClient.setQueryData<Plex.Metadata>(metadataKey, update);
    },
    [metadataKey],
  );
  const [guidLoading, setGuidLoading] = useState(Boolean(!mediaID && plexGuid));
  const [guidError, setGuidError] = useState<string | null>(null);
  const loading = mediaID ? metadata.isPending : guidLoading;
  const loadError =
    guidError ?? (metadata.error ? "Could not load this title from the Plex server." : null);
  const initializedSeason = useRef<readonly unknown[] | null>(null);
  const [resolvedRatingKey, setResolvedRatingKey] = useState<string | null>(null);
  const [selectedSeason, setSelectedSeason] = useState(0);
  const [episodes, setEpisodes] = useState<Plex.Metadata[] | null>(null);
  const [episodeRevision, setEpisodeRevision] = useState(0);
  const [languages, setLanguages] = useState<string[] | null>(null);
  const [subtitles, setSubtitles] = useState<string[] | null>(null);

  const selectedSeasonId = data?.Children?.Metadata?.find(
    (season) => season.index === selectedSeason,
  )?.ratingKey;
  const isShow = data?.type === "show";
  useEffect(() => {
    let active = true;
    setGuidLoading(Boolean(!mediaID && plexGuid));
    setGuidError(null);
    initializedSeason.current = null;
    setResolvedRatingKey(null);
    setSelectedSeason(0);
    setEpisodes(null);
    setLanguages(null);
    setSubtitles(null);

    if (!mediaID && !plexGuid)
      return () => {
        active = false;
      };

    if (!mediaID && plexGuid) {
      void getMediaByGuid(plexGuid)
        .then((localItem) => {
          if (!active) return;
          if (!localItem) {
            setGuidError("This title is not available on this Plex server.");
            setGuidLoading(false);
            return;
          }
          setResolvedRatingKey(localItem.ratingKey.toString());
        })
        .catch(() => {
          if (!active) return;
          setGuidError("Could not resolve this title on the Plex server.");
          setGuidLoading(false);
        });

      return () => {
        active = false;
      };
    }

    return () => {
      active = false;
    };
  }, [mediaID, plexGuid, profileKey, serverId]);

  useEffect(() => {
    if (data && initializedSeason.current !== metadataKey) {
      initializedSeason.current = metadataKey;
      setSelectedSeason(selectInitialSeason(data));
    }
  }, [data, metadataKey]);

  useEffect(() => {
    let active = true;
    setEpisodes(null);

    if (!isShow)
      return () => {
        active = false;
      };
    if (!selectedSeasonId) {
      setEpisodes([]);
      return () => {
        active = false;
      };
    }

    void getMediaChildren(selectedSeasonId)
      .then((items) => {
        if (active) setEpisodes(items);
      })
      .catch(() => {
        if (active) setEpisodes([]);
      });

    return () => {
      active = false;
    };
  }, [isShow, episodeRevision, selectedSeasonId]);

  useEffect(() => {
    let active = true;
    setLanguages(null);
    setSubtitles(null);

    if (!data)
      return () => {
        active = false;
      };
    if (data.type === "movie") {
      setLanguages(trackLanguages(data, 2));
      setSubtitles(trackLanguages(data, 3));
      return () => {
        active = false;
      };
    }
    if (data.type !== "show" || episodes === null)
      return () => {
        active = false;
      };

    const firstEpisode = episodes[0];
    if (!firstEpisode) {
      setLanguages([]);
      setSubtitles([]);
      return () => {
        active = false;
      };
    }

    void getMediaMetadata(firstEpisode.ratingKey)
      .then((metadata) => {
        if (!active) return;
        setLanguages(trackLanguages(metadata, 2));
        setSubtitles(trackLanguages(metadata, 3));
      })
      .catch(() => {
        if (!active) return;
        setLanguages([]);
        setSubtitles([]);
      });

    return () => {
      active = false;
    };
  }, [data, episodes]);

  const refetchEpisodes = useCallback(() => setEpisodeRevision((revision) => revision + 1), []);

  return {
    data,
    episodes,
    languages,
    loadError,
    loading,
    refetchEpisodes,
    resolvedRatingKey,
    selectedSeason,
    setData,
    setSelectedSeason,
    subtitles,
  };
}
