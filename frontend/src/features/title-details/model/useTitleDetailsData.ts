import {
  getMediaByGuid,
  getMediaChildren,
  getMediaMetadata,
  getTrackChoices,
} from "entities/media/model";
import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
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
  const [data, setData] = useState<Plex.Metadata>();
  const [loading, setLoading] = useState(Boolean(mediaID || plexGuid));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [resolvedRatingKey, setResolvedRatingKey] = useState<string | null>(null);
  const [selectedSeason, setSelectedSeason] = useState(0);
  const [episodes, setEpisodes] = useState<Plex.Metadata[] | null>(null);
  const [episodeRevision, setEpisodeRevision] = useState(0);
  const [languages, setLanguages] = useState<string[] | null>(null);
  const [subtitles, setSubtitles] = useState<string[] | null>(null);

  useEffect(() => {
    let active = true;
    setData(undefined);
    setLoading(Boolean(mediaID || plexGuid));
    setLoadError(null);
    setResolvedRatingKey(null);
    setSelectedSeason(0);
    setEpisodes(null);
    setLanguages(null);
    setSubtitles(null);

    if (!mediaID && !plexGuid) return () => { active = false; };

    if (!mediaID && plexGuid) {
      void getMediaByGuid(plexGuid)
        .then((localItem) => {
          if (!active) return;
          if (!localItem) {
            setLoadError("This title is not available on this Plex server.");
            setLoading(false);
            return;
          }
          setResolvedRatingKey(localItem.ratingKey.toString());
        })
        .catch(() => {
          if (!active) return;
          setLoadError("Could not resolve this title on the Plex server.");
          setLoading(false);
        });

      return () => { active = false; };
    }

    void getMediaMetadata(mediaID as string)
      .then((metadata) => {
        if (!active) return;
        if (!metadata) throw new Error("Metadata not found");
        setSelectedSeason(selectInitialSeason(metadata));
        setData(metadata);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setLoadError("Could not load this title from the Plex server.");
        setLoading(false);
      });

    return () => { active = false; };
  }, [mediaID, plexGuid]);

  useEffect(() => {
    let active = true;
    setEpisodes(null);

    if (data?.type !== "show") return () => { active = false; };
    const season = data.Children?.Metadata?.find(
      (candidate) => candidate.index === selectedSeason,
    );
    if (!season?.ratingKey) {
      setEpisodes([]);
      return () => { active = false; };
    }

    void getMediaChildren(season.ratingKey)
      .then((items) => {
        if (active) setEpisodes(items);
      })
      .catch(() => {
        if (active) setEpisodes([]);
      });

    return () => { active = false; };
  }, [data, episodeRevision, selectedSeason]);

  useEffect(() => {
    let active = true;
    setLanguages(null);
    setSubtitles(null);

    if (!data) return () => { active = false; };
    if (data.type === "movie") {
      setLanguages(trackLanguages(data, 2));
      setSubtitles(trackLanguages(data, 3));
      return () => { active = false; };
    }
    if (data.type !== "show" || episodes === null)
      return () => { active = false; };

    const firstEpisode = episodes[0];
    if (!firstEpisode) {
      setLanguages([]);
      setSubtitles([]);
      return () => { active = false; };
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

    return () => { active = false; };
  }, [data, episodes]);

  const refetchEpisodes = useCallback(
    () => setEpisodeRevision((revision) => revision + 1),
    [],
  );

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
