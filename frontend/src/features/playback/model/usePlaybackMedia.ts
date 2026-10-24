import { useEffect, useRef, useState } from "react";
import {
  type MediaMetadata,
  chooseBestMediaVersion,
  findPreferredStream,
  getMediaVersions,
  getMediaMetadata,
  getTrackChoices,
  MediaVersion,
  parseTrackPreference,
  preferenceFromStream,
  TrackChoice,
  TrackPreference,
  useMediaPlaybackSource,
  withSelectedTrack,
} from "entities/media/model";
import { useAuthSession } from "features/session/model";
import { useUserSettings } from "features/settings/model";
import type { PlaylistPlaybackContext } from "features/media-lists/model";
import { putAudioStream, putSubtitleStream } from "../api/playback";
import { downloadSubtitle } from "../api/subtitles";
import {
  parseStoredPlaybackQuality,
  persistPlaybackQuality,
} from "./playbackQuality";
import type { PlaybackQuality } from "./playbackQuality";
import { waitForAttachedSubtitle } from "./subtitles";
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

function preferenceScope(metadata: MediaMetadata) {
  return metadata.grandparentRatingKey || metadata.ratingKey;
}

function storedTrackPreference(
  metadata: MediaMetadata,
  kind: "AUDIO" | "SUBTITLE",
) {
  return parseTrackPreference(
    useUserSettings.getState().settings[
      `MEDIA_PREF_${kind}-${preferenceScope(metadata)}`
    ],
  );
}

function persistTrackPreference(
  metadata: MediaMetadata,
  kind: "AUDIO" | "SUBTITLE",
  preference: TrackPreference,
) {
  void useUserSettings
    .getState()
    .setSetting(
      `MEDIA_PREF_${kind}-${preferenceScope(metadata)}`,
      JSON.stringify(preference),
    );
}

async function applyTrackPreferences(
  version: MediaVersion,
  audioPreference: TrackPreference | null,
  subtitlePreference: TrackPreference | null,
  signal: AbortSignal,
) {
  if (version.part.id === undefined) return false;
  const audio = findPreferredStream(version, 2, audioPreference);
  const subtitle = findPreferredStream(version, 3, subtitlePreference);
  if (!audio && !subtitle && subtitlePreference?.index !== -1) return false;
  if (audio?.id !== undefined)
    await putAudioStream(version.part.id, audio.id, signal);

  if (subtitlePreference?.index === -1) {
    await putSubtitleStream(version.part.id, 0, signal);
    return true;
  }
  if (subtitle?.id !== undefined)
    await putSubtitleStream(version.part.id, subtitle.id, signal);
  return audio?.id !== undefined || subtitle?.id !== undefined;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Playback setup failed.";
}

export function usePlaybackMedia(options: PlaybackMediaOptions) {
  const callbacks = useRef(options);
  callbacks.current = options;
  const request = useRef<AbortController | null>(null);
  const sessionRevision = useAuthSession((state) => state.revision);

  const [metadata, setMetadata] = useState<MediaMetadata | null>(null);
  const [showMetadata, setShowMetadata] = useState<MediaMetadata | null>(null);
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

  const parentID =
    metadata?.type === "episode" ? metadata.grandparentRatingKey : undefined;
  useEffect(() => {
    setShowMetadata(null);
    if (!parentID) return;
    const controller = new AbortController();
    void getMediaMetadata(parentID, controller.signal)
      .then((show) => {
        if (!controller.signal.aborted) setShowMetadata(show);
      })
      .catch(() => {
        // Series information is optional and must not block the episode.
      });
    return () => controller.abort();
  }, [parentID, sessionRevision]);

  useEffect(() => {
    if (!options.itemID) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const itemID = options.itemID;
    callbacks.current.onSourceChanging();
    setMetadata(null);
    setShowMetadata(null);
    setQuality(parseStoredPlaybackQuality(localStorage.getItem("quality")));
    callbacks.current.setError(false);

    void (async () => {
      try {
        const initialMetadata = await getMediaMetadata(
          itemID,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        if (!["movie", "episode"].includes(initialMetadata.type))
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

        const configured = autoMatch
          ? await applyTrackPreferences(
              version,
              audioPreference,
              subtitlePreference,
              controller.signal,
            )
          : false;
        const loaded = configured
          ? await getMediaMetadata(itemID, controller.signal)
          : initialMetadata;
        if (controller.signal.aborted) return;
        if (!["movie", "episode"].includes(loaded.type))
          throw new Error("No playable media is available.");
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
      } catch (error) {
        if (!controller.signal.aborted)
          callbacks.current.setError(errorMessage(error));
      }
    })();

    return () => {
      request.current?.abort();
    };
    // Quality changes restart the current source explicitly. They must not
    // repeat the complete initial selection flow.
    // oxlint-disable-next-line react/exhaustive-deps
  }, [options.itemID, initialRevision, sessionRevision]);

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

  const ownsPlayback = () =>
    metadata?.ratingKey === callbacks.current.itemID &&
    useAuthSession.getState().revision === sessionRevision;
  const assertCurrentPlayback = (signal?: AbortSignal) => {
    signal?.throwIfAborted();
    if (!ownsPlayback())
      throw new DOMException("The active playback changed.", "AbortError");
  };

  const publishPlayback = (
    loaded: MediaMetadata,
    version: MediaVersion,
    nextQuality: PlaybackQuality,
    signal: AbortSignal,
    resumeAt: number,
  ) => {
    assertCurrentPlayback(signal);
    if (loaded.ratingKey !== callbacks.current.itemID)
      throw new DOMException("Media changed.", "AbortError");
    const refreshedVersion = getMediaVersions(loaded).find(
      (candidate) =>
        candidate.part.key === version.part.key &&
        candidate.part.id === version.part.id,
    );
    if (!refreshedVersion || !["movie", "episode"].includes(loaded.type))
      throw new Error("No playable media is available.");
    callbacks.current.onSourceChanging();
    callbacks.current.requestResumeAt(resumeAt);
    setMetadata(loaded);
    setQuality(nextQuality);
    setActiveMediaIndex(refreshedVersion.mediaIndex);
    setActivePartIndex(refreshedVersion.partIndex);
    callbacks.current.setError(false);
  };

  const restartPlayback = async (
    version: MediaVersion,
    nextQuality = quality,
    configure?: (signal: AbortSignal) => Promise<void>,
    selectedTrack?: TrackChoice,
  ) => {
    const itemID = callbacks.current.itemID;
    if (!itemID || !metadata || !ownsPlayback()) return false;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const resumeAt = callbacks.current.getCurrentTime();

    try {
      if (configure) await configure(controller.signal);
      const response = await getMediaMetadata(itemID, controller.signal);
      const loaded = selectedTrack
        ? withSelectedTrack(response, selectedTrack)
        : response;
      publishPlayback(
        loaded,
        version,
        nextQuality,
        controller.signal,
        resumeAt,
      );
      return true;
    } catch (error) {
      if (!controller.signal.aborted) {
        if (selectedTrack?.stream.streamType === 3 && playbackSource.source)
          playbackSource.reportSubtitleError({
            sourceId: playbackSource.source.id,
            kind: "subtitle",
            message: errorMessage(error),
            position: callbacks.current.getCurrentTime(),
          });
        else callbacks.current.setError(errorMessage(error));
      }
      return false;
    }
  };

  const selectMediaVersion = async (version: MediaVersion) => {
    const autoMatch =
      useUserSettings.getState().settings.AUTO_MATCH_TRACKS === "true";
    await restartPlayback(version, quality, async (signal) => {
      if (!metadata || !autoMatch) return;
      await applyTrackPreferences(
        version,
        storedTrackPreference(metadata, "AUDIO"),
        storedTrackPreference(metadata, "SUBTITLE"),
        signal,
      );
    });
  };

  const selectAudioTrack = async (choice: TrackChoice) => {
    if (!metadata) return;
    const subtitlePreference = selectedPreference(3);
    if (
      await restartPlayback(
        choice,
        quality,
        async (signal) => {
          await putAudioStream(choice.part.id, choice.stream.id, signal);
          if (subtitlePreference)
            await applyTrackPreferences(
              choice,
              null,
              subtitlePreference,
              signal,
            );
        },
        choice,
      )
    )
      persistTrackPreference(
        metadata,
        "AUDIO",
        preferenceFromStream(choice.stream),
      );
  };

  const selectSubtitleTrack = async (choice: TrackChoice) => {
    if (!metadata) return false;
    const audioPreference = selectedPreference(2);
    const changed = await restartPlayback(
      choice,
      quality,
      async (signal) => {
        await putSubtitleStream(choice.part.id, choice.stream.id, signal);
        if (audioPreference)
          await applyTrackPreferences(choice, audioPreference, null, signal);
      },
      choice,
    );
    if (changed)
      persistTrackPreference(
        metadata,
        "SUBTITLE",
        preferenceFromStream(choice.stream),
      );
    return changed;
  };

  const disableSubtitles = async () => {
    if (!metadata || !activeVersion) return;
    if (
      await restartPlayback(
        activeVersion,
        quality,
        (signal) => putSubtitleStream(activeVersion.part.id, 0, signal),
        { ...activeVersion, stream: { streamType: 3, id: 0 } },
      )
    )
      persistTrackPreference(metadata, "SUBTITLE", {
        index: -1,
        title: "None",
      });
  };

  const selectQuality = async (nextQuality: PlaybackQuality) => {
    if (!activeVersion) return;
    if (await restartPlayback(activeVersion, nextQuality))
      persistPlaybackQuality(nextQuality);
  };

  const tryOriginal = () => {
    if (
      !playbackSource.canTryOriginal ||
      metadata?.ratingKey !== callbacks.current.itemID
    )
      return false;
    request.current?.abort();
    callbacks.current.onSourceChanging();
    callbacks.current.setError(false);
    setQuality({ bitrate: -1 });
    return true;
  };

  const downloadOnDemandSubtitle = async (subtitle: SubtitleSearchResult) => {
    const itemID = callbacks.current.itemID;
    if (!itemID || !metadata || !activeVersion)
      throw new Error("No active media file is available.");
    assertCurrentPlayback();
    const mediaItemID = activeVersion.media.id;
    if (mediaItemID === undefined || activeVersion.part.id === undefined)
      throw new Error(
        "Plex did not identify this media version for subtitle downloads.",
      );
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const { signal } = controller;
    try {
      // Download, attachment and selection are one operation. Selecting must not
      // abort the request which is still waiting for that same download.
      await downloadSubtitle(metadata.ratingKey, mediaItemID, subtitle, signal);
      const attached = await waitForAttachedSubtitle(
        () => {
          assertCurrentPlayback(signal);
          return getMediaMetadata(itemID, signal);
        },
        activeVersion,
        subtitle,
        signal,
      );
      assertCurrentPlayback(signal);
      await putSubtitleStream(
        attached.choice.part.id,
        attached.choice.stream.id,
        signal,
      );
      assertCurrentPlayback(signal);
      const audioPreference = selectedPreference(2);
      if (audioPreference)
        await applyTrackPreferences(
          attached.choice,
          audioPreference,
          null,
          signal,
        );
      publishPlayback(
        withSelectedTrack(attached.metadata, attached.choice),
        attached.choice,
        quality,
        signal,
        callbacks.current.getCurrentTime(),
      );
      persistTrackPreference(
        metadata,
        "SUBTITLE",
        preferenceFromStream(attached.choice.stream),
      );
    } catch (error) {
      signal.throwIfAborted();
      throw error;
    }
  };

  return {
    metadata,
    showMetadata,
    playQueue,
    queueError,
    reloadQueue,
    source: playbackSource.source,
    sourceLoading: playbackSource.loading,
    reportSourceError: playbackSource.reportError,
    reportSubtitleError: playbackSource.reportSubtitleError,
    subtitleError: playbackSource.subtitleError,
    reportSourceReady: playbackSource.reportReady,
    reloadSource: () =>
      metadata
        ? playbackSource.reload()
        : setInitialRevision((revision) => revision + 1),
    quality,
    canTryOriginal: playbackSource.canTryOriginal,
    tryOriginal,
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
