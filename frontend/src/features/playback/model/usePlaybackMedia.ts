import { useEffect, useRef, useState } from "react";
import {
  chooseBestMediaVersion,
  findPreferredStream,
  getMediaVersions,
  getTrackChoices,
  MediaVersion,
  parseTrackPreference,
  preferenceFromStream,
  TrackChoice,
  TrackPreference,
  useMediaPlaybackSource,
} from "entities/media/model";
import { useUserSettings } from "features/settings/model";
import type { PlaylistPlaybackContext } from "features/media-lists/model";
import {
  getPlaybackMetadata,
  putAudioStream,
  putSubtitleStream,
} from "../api/playback";
import { downloadSubtitle } from "../api/subtitles";
import {
  parseStoredPlaybackQuality,
  persistPlaybackQuality,
} from "./playbackQuality";
import type { PlaybackQuality } from "./playbackQuality";
import { findAttachedSubtitle } from "./subtitles";
import type { SubtitleSearchResult } from "./subtitles";
import { usePlaybackQueue } from "./usePlaybackQueue";

interface PlaybackMediaOptions {
  itemID?: string;
  playlistContext?: PlaylistPlaybackContext;
  getCurrentTime: () => number;
  onSourceChanging: () => void;
  requestResumeAt: (time: number) => void;
  setError: (error: string | false) => void;
}

function preferenceScope(metadata: Plex.Metadata) {
  return metadata.grandparentRatingKey || metadata.ratingKey;
}

function storedTrackPreference(
  metadata: Plex.Metadata,
  kind: "AUDIO" | "SUBTITLE",
) {
  return parseTrackPreference(
    useUserSettings.getState().settings[
      `MEDIA_PREF_${kind}-${preferenceScope(metadata)}`
    ],
  );
}

async function applyTrackPreferences(
  version: MediaVersion,
  audioPreference: TrackPreference | null,
  subtitlePreference: TrackPreference | null,
) {
  const audio = findPreferredStream(version, 2, audioPreference);
  if (audio) await putAudioStream(version.part.id, audio.id);

  if (subtitlePreference?.index === -1) {
    await putSubtitleStream(version.part.id, 0);
    return;
  }
  const subtitle = findPreferredStream(version, 3, subtitlePreference);
  if (subtitle) await putSubtitleStream(version.part.id, subtitle.id);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Playback setup failed.";
}

export function usePlaybackMedia(options: PlaybackMediaOptions) {
  const callbacks = useRef(options);
  callbacks.current = options;
  const operation = useRef(0);

  const [metadata, setMetadata] = useState<Plex.Metadata | null>(null);
  const [showMetadata, setShowMetadata] = useState<Plex.Metadata | null>(null);
  const { playQueue, queueError, reloadQueue } = usePlaybackQueue(
    metadata,
    options.playlistContext,
  );
  const [activeMediaIndex, setActiveMediaIndex] = useState(0);
  const [activePartIndex, setActivePartIndex] = useState(0);
  const [quality, setQuality] = useState<PlaybackQuality>(() =>
    parseStoredPlaybackQuality(localStorage.getItem("quality")),
  );
  const [initialRevision, setInitialRevision] = useState(0);

  const updateContext = (loaded: Plex.Metadata) => {
    const itemID = loaded.ratingKey;
    if (loaded.type === "episode" && loaded.grandparentRatingKey) {
      void getPlaybackMetadata(loaded.grandparentRatingKey)
        .then((show) => {
          if (callbacks.current.itemID === itemID) setShowMetadata(show);
        })
        .catch(() => undefined);
    } else {
      setShowMetadata(null);
    }
  };

  useEffect(() => {
    if (!options.itemID) return;
    const operationID = ++operation.current;
    const itemID = options.itemID;
    callbacks.current.onSourceChanging();
    setMetadata(null);
    setShowMetadata(null);
    callbacks.current.setError(false);

    void (async () => {
      try {
        const initialMetadata = await getPlaybackMetadata(itemID);
        if (operation.current !== operationID) return;
        if (
          !initialMetadata ||
          !["movie", "episode"].includes(initialMetadata.type)
        )
          throw new Error("No playable media is available.");

        const autoMatch =
          useUserSettings.getState().settings.AUTO_MATCH_TRACKS === "true";
        const audioPreference = autoMatch
          ? storedTrackPreference(initialMetadata, "AUDIO")
          : null;
        const subtitlePreference = autoMatch
          ? storedTrackPreference(initialMetadata, "SUBTITLE")
          : null;
        const version = chooseBestMediaVersion(
          initialMetadata,
          audioPreference,
          subtitlePreference,
        );
        if (!version)
          throw new Error("No playable media version is available.");

        if (autoMatch) {
          await applyTrackPreferences(
            version,
            audioPreference,
            subtitlePreference,
          );
        }
        const loaded = await getPlaybackMetadata(itemID);
        if (
          operation.current !== operationID ||
          !loaded ||
          !["movie", "episode"].includes(loaded.type)
        )
          return;
        const loadedVersion =
          getMediaVersions(loaded).find(
            (candidate) =>
              candidate.mediaIndex === version.mediaIndex &&
              candidate.partIndex === version.partIndex,
          ) || version;

        setMetadata(loaded);
        setActiveMediaIndex(loadedVersion.mediaIndex);
        setActivePartIndex(loadedVersion.partIndex);
        callbacks.current.setError(false);
        updateContext(loaded);
      } catch (error) {
        if (operation.current === operationID)
          callbacks.current.setError(errorMessage(error));
      }
    })();

    return () => {
      operation.current += 1;
    };
    // Quality changes restart the current source explicitly. They must not
    // repeat the complete initial selection flow.
    // oxlint-disable-next-line react/exhaustive-deps
  }, [options.itemID, initialRevision]);

  const mediaVersions = metadata ? getMediaVersions(metadata) : [];
  const activeVersion =
    mediaVersions.find(
      (version) =>
        version.mediaIndex === activeMediaIndex &&
        version.partIndex === activePartIndex,
    ) || mediaVersions[0];
  const audioChoices = metadata ? getTrackChoices(metadata, 2) : [];
  const subtitleChoices = metadata ? getTrackChoices(metadata, 3) : [];
  const playbackSource = useMediaPlaybackSource(
    metadata,
    activeVersion,
    quality,
  );
  useEffect(() => {
    if (playbackSource.error) callbacks.current.setError(playbackSource.error);
  }, [playbackSource.error]);

  const selectedPreference = (streamType: 2 | 3) => {
    const stream = activeVersion?.part.Stream?.find(
      (candidate) => candidate.streamType === streamType && candidate.selected,
    );
    if (stream) return preferenceFromStream(stream);
    return streamType === 3
      ? ({ index: -1, title: "None" } satisfies TrackPreference)
      : null;
  };

  const restartPlayback = async (
    version: MediaVersion,
    nextQuality = quality,
    configure?: () => Promise<void>,
  ) => {
    const itemID = callbacks.current.itemID;
    if (!itemID || !metadata) return false;
    const operationID = ++operation.current;
    const resumeAt = callbacks.current.getCurrentTime();
    callbacks.current.onSourceChanging();

    try {
      if (configure) await configure();
      const loaded = await getPlaybackMetadata(itemID);
      if (
        operation.current !== operationID ||
        !loaded ||
        !["movie", "episode"].includes(loaded.type)
      )
        return false;
      const refreshedVersion =
        getMediaVersions(loaded).find(
          (candidate) =>
            candidate.mediaIndex === version.mediaIndex &&
            candidate.partIndex === version.partIndex,
        ) || version;

      setMetadata(loaded);
      setQuality(nextQuality);
      callbacks.current.setError(false);
      callbacks.current.requestResumeAt(resumeAt);
      setActiveMediaIndex(refreshedVersion.mediaIndex);
      setActivePartIndex(refreshedVersion.partIndex);
      return true;
    } catch (error) {
      if (operation.current === operationID)
        callbacks.current.setError(errorMessage(error));
      return false;
    }
  };

  const selectMediaVersion = async (version: MediaVersion) => {
    const autoMatch =
      useUserSettings.getState().settings.AUTO_MATCH_TRACKS === "true";
    await restartPlayback(version, quality, async () => {
      if (!metadata || !autoMatch) return;
      await applyTrackPreferences(
        version,
        storedTrackPreference(metadata, "AUDIO"),
        storedTrackPreference(metadata, "SUBTITLE"),
      );
    });
  };

  const selectAudioTrack = async (choice: TrackChoice) => {
    if (!metadata) return;
    const preference = preferenceFromStream(choice.stream);
    void useUserSettings
      .getState()
      .setSetting(
        `MEDIA_PREF_AUDIO-${preferenceScope(metadata)}`,
        JSON.stringify(preference),
      );
    const subtitlePreference = selectedPreference(3);
    await restartPlayback(choice, quality, async () => {
      await putAudioStream(choice.part.id, choice.stream.id);
      if (subtitlePreference)
        await applyTrackPreferences(choice, null, subtitlePreference);
    });
  };

  const selectSubtitleTrack = async (choice: TrackChoice) => {
    if (!metadata) return false;
    const preference = preferenceFromStream(choice.stream);
    void useUserSettings
      .getState()
      .setSetting(
        `MEDIA_PREF_SUBTITLE-${preferenceScope(metadata)}`,
        JSON.stringify(preference),
      );
    const audioPreference = selectedPreference(2);
    return restartPlayback(choice, quality, async () => {
      await putSubtitleStream(choice.part.id, choice.stream.id);
      if (audioPreference)
        await applyTrackPreferences(choice, audioPreference, null);
    });
  };

  const disableSubtitles = async () => {
    if (!metadata || !activeVersion) return;
    void useUserSettings
      .getState()
      .setSetting(
        `MEDIA_PREF_SUBTITLE-${preferenceScope(metadata)}`,
        JSON.stringify({ index: -1, title: "None" } satisfies TrackPreference),
      );
    await restartPlayback(activeVersion, quality, () =>
      putSubtitleStream(activeVersion.part.id, 0),
    );
  };

  const selectQuality = async (nextQuality: PlaybackQuality) => {
    if (!activeVersion) return;
    if (await restartPlayback(activeVersion, nextQuality))
      persistPlaybackQuality(nextQuality);
  };

  const downloadOnDemandSubtitle = async (subtitle: SubtitleSearchResult) => {
    const itemID = callbacks.current.itemID;
    if (!itemID || !metadata || !activeVersion)
      throw new Error("No active media file is available.");

    const operationID = operation.current;
    const mediaItemID = activeVersion.media.id;
    await downloadSubtitle(metadata.ratingKey, mediaItemID, subtitle);
    for (let attempt = 0; attempt < 40; attempt += 1) {
      if (
        operation.current !== operationID ||
        callbacks.current.itemID !== itemID
      )
        return;
      if (attempt > 0)
        await new Promise((resolve) => window.setTimeout(resolve, 500));
      if (
        operation.current !== operationID ||
        callbacks.current.itemID !== itemID
      )
        return;
      const refreshed = await getPlaybackMetadata(itemID);
      if (!refreshed) continue;
      const choice = findAttachedSubtitle(refreshed, mediaItemID, subtitle);
      if (!choice) continue;
      if (await selectSubtitleTrack(choice)) return;
      break;
    }
    throw new Error(
      "Plex accepted the download, but the subtitle did not become available in time.",
    );
  };

  return {
    metadata,
    showMetadata,
    playQueue,
    queueError,
    reloadQueue,
    source: playbackSource.source,
    sourceLoading: playbackSource.loading,
    recoverSource: playbackSource.recover,
    reloadSource: () =>
      metadata
        ? playbackSource.reload()
        : setInitialRevision((revision) => revision + 1),
    quality,
    activeVersion,
    mediaVersions,
    audioChoices,
    subtitleChoices,
    selectQuality,
    selectMediaVersion,
    selectAudioTrack,
    selectSubtitleTrack,
    disableSubtitles,
    downloadOnDemandSubtitle,
  };
}

export type PlaybackMediaController = ReturnType<typeof usePlaybackMedia>;
