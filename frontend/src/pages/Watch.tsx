import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  getLibraryDir,
  getLibraryMeta,
  getPlayQueue,
  getServerPreferences,
  getStreamProps,
  getTimelineUpdate,
  getTranscodeImageURL,
  getUniversalDecision,
  putAudioStream,
  putSubtitleStream,
  sendUniversalPing,
} from "../plex";
import CenteredSpinner from "../components/CenteredSpinner";
import {
  alpha,
  Backdrop,
  Box,
  Button,
  Divider,
  Fade,
  IconButton,
  Paper,
  Popover,
  Popper,
  Slider,
  Theme,
  Typography,
  useTheme,
} from "@mui/material";
import ReactPlayer from "react-player";
import {
  getIncludeProps,
  getXPlexProps,
  queryBuilder,
} from "../plex/QuickFunctions";
import {
  ArrowBackIosNewRounded,
  ArrowBackIosRounded,
  CheckRounded,
  FullscreenRounded,
  PauseRounded,
  PeopleRounded,
  PlayArrowRounded,
  SearchRounded,
  SkipNext,
  SkipNextRounded,
  TuneRounded,
  VolumeUpRounded,
} from "@mui/icons-material";
import { VideoSeekSlider } from "react-video-seek-slider";
import "react-video-seek-slider/styles.css";
import { useSessionStore } from "../states/SessionState";
import { durationToText } from "../components/MovieItemSlider";
import {
  SessionStateEmitter,
  useSyncSessionState,
} from "../states/SyncSessionState";
import { useSyncInterfaceState } from "../components/PerPlexedSync";
import { absoluteDifference } from "../common/NumberExtra";
import WatchShowChildView from "../components/WatchShowChildView";
import { useUserSettings } from "../states/UserSettingsState";
import PlaybackNextEPButton from "../components/PlaybackNextEPButton";
import { getBackendURL } from "../backendURL";
import { platformCache } from "../common/DesktopApp";
import {
  chooseBestMediaVersion,
  findPreferredStream,
  getMediaVersions,
  getTrackChoices,
  MediaVersion,
  mediaVersionDetails,
  parseTrackPreference,
  preferenceFromStream,
  TrackPreference,
} from "../plex/mediaVersions";
import SubtitleSearchPanel from "../components/SubtitleSearchPanel";
import {
  downloadSubtitle,
  findAttachedSubtitle,
  SubtitleSearchResult,
} from "../plex/subtitles";

let SessionID = "";
export { SessionID };

const getUrl = (
  data: Plex.Metadata,
  quality: { bitrate?: number; auto?: boolean },
  version?: MediaVersion,
) => {
  const selected = version || getMediaVersions(data)[0];
  const bitrate = quality
    ? quality.bitrate
    : parseInt(localStorage.getItem("quality") ?? "10000");
  if (bitrate === -1 && selected)
    return `${getBackendURL()}/dynproxy${selected.part.key}?${queryBuilder({
      ...getXPlexProps(),
    })}`;

  return `${getBackendURL()}/dynproxy/video/:/transcode/universal/start.${
    platformCache.isDesktop ? "m3u8" : "mpd"
  }?${queryBuilder({
    ...getStreamProps(data.ratingKey as string, {
      ...(quality.bitrate && {
        maxVideoBitrate: bitrate,
      }),
      mediaIndex: selected?.mediaIndex ?? 0,
      partIndex: selected?.partIndex ?? 0,
    }),
  })}`;
};

function preferenceScope(data: Plex.Metadata) {
  return data.grandparentRatingKey || data.ratingKey;
}

function storedTrackPreference(data: Plex.Metadata, kind: "AUDIO" | "SUBTITLE") {
  return parseTrackPreference(
    useUserSettings.getState().settings[
      `MEDIA_PREF_${kind}-${preferenceScope(data)}`
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

function Watch() {
  const { itemID } = useParams<{ itemID: string }>();
  const [params] = useSearchParams();
  const theme = useTheme();
  const navigate = useNavigate();

  const { sessionID } = useSessionStore();
  const { settings } = useUserSettings();

  const [metadata, setMetadata] = useState<Plex.Metadata | null>(null);
  const [activeMediaIndex, setActiveMediaIndex] = useState(0);
  const [activePartIndex, setActivePartIndex] = useState(0);
  const [showmetadata, setShowMetadata] = useState<Plex.Metadata | null>(null);
  const [playQueue, setPlayQueue] = useState<Plex.Metadata[] | null>(null); // [current, ...next]
  const player = useRef<ReactPlayer | null>(null);
  const [quality, setQuality] = useState<{
    bitrate?: number;
    auto?: boolean;
  }>({
    ...(localStorage.getItem("quality") && {
      bitrate: parseInt(localStorage.getItem("quality") ?? "10000"),
    }),
  });
  const [url, setURL] = useState<string>("");

  const [volume, setVolume] = useState<number>(
    parseInt(localStorage.getItem("volume") ?? "100"),
  );

  const lastAppliedTime = useRef<number>(0);

  const [playing, setPlaying] = useState(true);
  const playingRef = useRef(playing);
  const [ready, setReady] = useState(false);
  const seekToAfterLoad = useRef<number | null>(null);
  const [progress, setProgress] = useState(0);
  const [buffered, setBuffered] = useState(0);

  const [volumePopoverAnchor, setVolumePopoverAnchor] =
    useState<HTMLButtonElement | null>(null);
  const volumePopoverOpen = Boolean(volumePopoverAnchor);

  const [showTune, setShowTune] = useState(false);
  const [tunePage, setTunePage] = useState<number>(0); // 0: menu, 1: video, 2: audio, 3: subtitles, 4: subtitle search
  const tuneButtonRef = useRef<HTMLButtonElement | null>(null);

  const playbackBarRef = useRef<HTMLDivElement | null>(null);

  const [buffering, setBuffering] = useState(false);
  const [showError, setShowError] = useState<string | false>(false);

  const { room, socket, isHost } = useSyncSessionState();
  const { setOpen: setSyncInterfaceOpen } =
    useSyncInterfaceState();

  const [controlElementsVisible, setControlElementsVisible] = useState(false);

  useEffect(() => {
    setControlElementsVisible(volumePopoverOpen || showTune);
  }, [volumePopoverOpen, showTune]);

  const loadMetadata = async (itemID: string) => {
    const mediacontainer = await getLibraryDir(`/library/metadata/${itemID}`, {
      ...getIncludeProps(),
    });
    const loadedMetadata = mediacontainer.Metadata?.[0] ?? null;
    if (!["movie", "episode"].includes(loadedMetadata?.type as string)) {
      console.error("Invalid metadata type");
      return null;
    }

    setMetadata(loadedMetadata);
    if (loadedMetadata.type === "episode") {
      getLibraryMeta(loadedMetadata.grandparentRatingKey as string).then((show) => {
        setShowMetadata(show);
      });
    }

    const serverPreferences = await getServerPreferences();

    getPlayQueue(
      `server://${
        serverPreferences.machineIdentifier
      }/com.plexapp.plugins.library/library/metadata/${
        loadedMetadata.ratingKey
      }`,
    ).then((queue) => {
      setPlayQueue(queue);
    });
    return loadedMetadata;
  };

  const restartPlayback = async (
    version: MediaVersion,
    nextQuality = quality,
    configure?: () => Promise<void>,
  ) => {
    if (!itemID || !metadata) return;
    const currentTime = player.current?.getCurrentTime() ?? 0;
    if (configure) await configure();

    setActiveMediaIndex(version.mediaIndex);
    setActivePartIndex(version.partIndex);
    await getUniversalDecision(itemID, {
      maxVideoBitrate: nextQuality.bitrate,
      autoAdjustQuality: nextQuality.auto,
      mediaIndex: version.mediaIndex,
      partIndex: version.partIndex,
    });
    const refreshed = await loadMetadata(itemID);
    const refreshedVersion = refreshed
      ? getMediaVersions(refreshed).find(
          (candidate) =>
            candidate.mediaIndex === version.mediaIndex &&
            candidate.partIndex === version.partIndex,
        )
      : undefined;

    seekToAfterLoad.current = currentTime;
    setURL("");
    setTimeout(() => {
      setURL(getUrl(refreshed || metadata, nextQuality, refreshedVersion || version));
    }, 100);
  };

  const [showControls, setShowControls] = useState(true);
  useEffect(() => {
    let timeout: number;
    let whenMouseMoves = () => {
      clearTimeout(timeout);
      setShowControls(true);
      timeout = setTimeout(() => {
        setShowControls(false);
      }, 5000);
    };

    document.addEventListener("mousemove", whenMouseMoves);
    return () => {
      document.removeEventListener("mousemove", whenMouseMoves);
    };
  }, [playing]);

  const [showInfo, setShowInfo] = useState(false);
  useEffect(() => {
    playingRef.current = playing;

    if (!playingRef.current) {
      setTimeout(() => {
        if (!playingRef.current) setShowInfo(true);
      }, 5000);
    } else {
      setShowInfo(false);
    }
  }, [playing]);

  useEffect(() => {
    if (!playing) return;

    if (showControls) document.body.style.cursor = "default";
    else document.body.style.cursor = "none";

    return () => {
      document.body.style.cursor = "default";
    };
  }, [playing, showControls]);

  useEffect(() => {
    const interval = setInterval(async () => {
      if (!itemID) return;
      await sendUniversalPing();
    }, 10000);

    if (itemID && isHost)
      socket?.emit("RES_SYNC_SET_PLAYBACK", {
        key: itemID,
        state: playing ? "playing" : "paused",
        time: player.current?.getCurrentTime() ?? 0,
      } satisfies PerPlexed.Sync.PlayBackState);

    return () => {
      clearInterval(interval);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost, itemID, socket]);

  useEffect(() => {
    if (!socket || !room) return;

    const resyncInterval = setInterval(async () => {
      if (!itemID || !socket || !isHost) return;

      socket.emit("RES_SYNC_RESYNC_PLAYBACK", {
        key: itemID,
        state: playing ? "playing" : "paused",
        time: player.current?.getCurrentTime() ?? 0,
      } satisfies PerPlexed.Sync.PlayBackState);
    }, 2500);

    const resyncPlayback = async (data: PerPlexed.Sync.PlayBackState) => {
      if (data.key !== itemID) {
        navigate(`/watch/${data.key}?t=${data.time}`);
        return;
      }

      if (data.time) {
        const dif = absoluteDifference(
          player.current?.getCurrentTime() ?? 0,
          data.time,
        );

        if (dif > 2) player.current?.seekTo(data.time, "seconds");
      }

      if (data.state === "playing") setPlaying(true);
      if (data.state === "paused") setPlaying(false);
    };

    const endPlayback = async () => {
      navigate("/sync/waitingroom");
    };

    const pausePlayback = async () => {
      setPlaying(false);
    };
    const resumePlayback = async () => {
      setPlaying(true);
    };
    const seekPlayback = async (time: number) => {
      player.current?.seekTo(time, "seconds");
    };

    if (!isHost) SessionStateEmitter.on("PLAYBACK_RESYNC", resyncPlayback);
    if (!isHost) SessionStateEmitter.on("PLAYBACK_END", endPlayback);

    SessionStateEmitter.on("PLAYBACK_PAUSE", pausePlayback);
    SessionStateEmitter.on("PLAYBACK_RESUME", resumePlayback);
    SessionStateEmitter.on("PLAYBACK_SEEK", seekPlayback);

    return () => {
      SessionStateEmitter.off("PLAYBACK_RESYNC", resyncPlayback);
      SessionStateEmitter.off("PLAYBACK_END", endPlayback);

      SessionStateEmitter.off("PLAYBACK_PAUSE", pausePlayback);
      SessionStateEmitter.off("PLAYBACK_RESUME", resumePlayback);
      SessionStateEmitter.off("PLAYBACK_SEEK", seekPlayback);

      clearInterval(resyncInterval);
    };
  }, [isHost, itemID, navigate, playing, room, socket]);

  useEffect(() => {
    if (!itemID) return;

    const updateTimeline = async () => {
      if (!player.current) return;
      const timelineUpdateData = await getTimelineUpdate(
        parseInt(itemID),
        Math.floor(player.current.getDuration()) * 1000,
        buffering ? "buffering" : playing ? "playing" : "paused",
        Math.floor(player.current.getCurrentTime()) * 1000,
      );

      if (!timelineUpdateData) return;

      const { terminationCode, terminationText } =
        timelineUpdateData.MediaContainer;
      if (terminationCode) {
        setShowError(`${terminationCode} - ${terminationText}`);
        setPlaying(false);
        socket?.emit("EVNT_SYNC_PAUSE");
      }
    };

    const updateInterval = setInterval(updateTimeline, 5000);

    return () => clearInterval(updateInterval);
  }, [buffering, itemID, playing, socket]);

  useEffect(() => {
    let active = true;
    const style = document.createElement("style");
    style.innerHTML = `
      .ui-video-seek-slider .track .main .connect {
        background-color: ${theme.palette.primary.main};
      }
      .ui-video-seek-slider .thumb .handler {
        background-color: ${theme.palette.primary.main};
      }
    `;
    document.head.appendChild(style);

    (async () => {
      setReady(false);

      if (!itemID) return;

      const initialMetadata = await getLibraryMeta(itemID);

      const autoMatchTracks =
        useUserSettings.getState().settings["AUTO_MATCH_TRACKS"] === "true";
      const audioPreference = autoMatchTracks
        ? storedTrackPreference(initialMetadata, "AUDIO")
        : null;
      const subtitlePreference = autoMatchTracks
        ? storedTrackPreference(initialMetadata, "SUBTITLE")
        : null;
      const version = chooseBestMediaVersion(
        initialMetadata,
        audioPreference,
        subtitlePreference,
      );
      if (!version) {
        setShowError("No playable media version is available.");
        return;
      }

      if (autoMatchTracks)
        await applyTrackPreferences(version, audioPreference, subtitlePreference);

      await getUniversalDecision(itemID, {
        maxVideoBitrate: quality.bitrate,
        autoAdjustQuality: quality.auto,
        mediaIndex: version.mediaIndex,
        partIndex: version.partIndex,
      });
      const loadedMetadata = await loadMetadata(itemID);
      if (!active || !loadedMetadata) return;

      const loadedVersion =
        getMediaVersions(loadedMetadata).find(
          (candidate) => candidate.mediaIndex === version.mediaIndex,
        ) || version;
      setActiveMediaIndex(version.mediaIndex);
      setActivePartIndex(version.partIndex);
      setURL(getUrl(loadedMetadata, quality, loadedVersion));
      setShowError(false);
    })();

    return () => {
      active = false;
      style.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemID, theme.palette.primary.main]);

  useEffect(() => {
    SessionID = sessionID;
  }, [sessionID]);

  useEffect(() => {
    if (!player.current) return;

    if (ready && !playing) setPlaying(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // playback controll buttons
  // SPACE: play/pause
  // LEFT: seek back 10 seconds
  // RIGHT: seek forward 10 seconds
  // UP: increase volume
  // DOWN: decrease volume
  // , (comma): Back 1 frame
  // . (period): Forward 1 frame
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const actions: { [key: string]: () => void } = {
        " ": () =>
          setPlaying((state) => {
            if (state) socket?.emit("EVNT_SYNC_PAUSE");
            else socket?.emit("EVNT_SYNC_RESUME");
            return !state;
          }),
        k: () =>
          setPlaying((state) => {
            if (state) socket?.emit("EVNT_SYNC_PAUSE");
            else socket?.emit("EVNT_SYNC_RESUME");
            return !state;
          }),
        j: () => {
          const l = player.current?.getCurrentTime() ?? 0;
          player.current?.seekTo(l - 10);
          socket?.emit("EVNT_SYNC_SEEK", l - 10);
        },
        l: () => {
          const l = player.current?.getCurrentTime() ?? 0;
          player.current?.seekTo(l + 10);
          socket?.emit("EVNT_SYNC_SEEK", l + 10);
        },
        s: () => {
          if (!metadata || !player.current) return;
          // if there is a marker like credits skip it
          const time = player.current.getCurrentTime();
          for (const marker of metadata.Marker ?? []) {
            if (
              !(
                marker.startTimeOffset / 1000 <= time &&
                marker.endTimeOffset / 1000 >= time
              )
            )
              continue;

            switch (marker.type) {
              case "credits":
                {
                  if (!marker.final) {
                    player.current.seekTo(marker.endTimeOffset / 1000 + 1);
                    return;
                  }

                  if (metadata.type === "movie")
                    return navigate(
                      `/browse/${metadata.librarySectionID}?${queryBuilder({
                        mid: metadata.ratingKey,
                      })}`,
                    );

                  if (!playQueue) return;
                  const next = playQueue[1];
                  if (!next)
                    return navigate(
                      `/browse/${metadata.librarySectionID}?${queryBuilder({
                        mid: metadata.grandparentRatingKey,
                        pid: metadata.parentRatingKey,
                        iid: metadata.ratingKey,
                      })}`,
                    );

                  navigate(`/watch/${next.ratingKey}`);
                }
                break;
              case "intro":
                player.current.seekTo(marker.endTimeOffset / 1000 + 1);
                break;
            }
          }
        },
        f: () => {
          if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen();
          } else document.exitFullscreen();
        },
        ArrowLeft: () => {
          const l = player.current?.getCurrentTime() ?? 0;
          player.current?.seekTo(l - 10);
          socket?.emit("EVNT_SYNC_SEEK", l - 10);
        },
        ArrowRight: () => {
          const l = player.current?.getCurrentTime() ?? 0;
          player.current?.seekTo(l + 10);
          socket?.emit("EVNT_SYNC_SEEK", l + 10);
        },
        ArrowUp: () => setVolume((state) => Math.min(state + 5, 100)),
        ArrowDown: () => setVolume((state) => Math.max(state - 5, 0)),
        ",": () => {
          const l = player.current?.getCurrentTime() ?? 0;
          player.current?.seekTo(l - 0.04);
          socket?.emit("EVNT_SYNC_SEEK", l - 0.04);
        },
        ".": () => {
          const l = player.current?.getCurrentTime() ?? 0;
          player.current?.seekTo(l + 0.04);
          socket?.emit("EVNT_SYNC_SEEK", l + 0.04);
        },
      };

      if (actions[e.key]) actions[e.key]();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [metadata, navigate, playQueue, socket]);

  const mediaVersions = metadata ? getMediaVersions(metadata) : [];
  const activeVersion =
    mediaVersions.find(
      (version) =>
        version.mediaIndex === activeMediaIndex &&
        version.partIndex === activePartIndex,
    ) || mediaVersions[0];
  const audioChoices = metadata ? getTrackChoices(metadata, 2) : [];
  const subtitleChoices = metadata ? getTrackChoices(metadata, 3) : [];

  const selectedPreference = (streamType: 2 | 3) => {
    const stream = activeVersion?.part.Stream?.find(
      (candidate) => candidate.streamType === streamType && candidate.selected,
    );
    if (stream) return preferenceFromStream(stream);
    return streamType === 3
      ? ({ index: -1, title: "None" } satisfies TrackPreference)
      : null;
  };

  const selectMediaVersion = async (version: MediaVersion) => {
    const autoMatch = settings.AUTO_MATCH_TRACKS === "true";
    await restartPlayback(version, quality, async () => {
      if (!metadata || !autoMatch) return;
      await applyTrackPreferences(
        version,
        storedTrackPreference(metadata, "AUDIO"),
        storedTrackPreference(metadata, "SUBTITLE"),
      );
    });
  };

  const selectAudioTrack = async (choice: (typeof audioChoices)[number]) => {
    if (!metadata) return;
    const preference = preferenceFromStream(choice.stream);
    void useUserSettings.getState().setSetting(
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

  const selectSubtitleTrack = async (
    choice: (typeof subtitleChoices)[number],
  ) => {
    if (!metadata) return;
    const preference = preferenceFromStream(choice.stream);
    void useUserSettings.getState().setSetting(
      `MEDIA_PREF_SUBTITLE-${preferenceScope(metadata)}`,
      JSON.stringify(preference),
    );
    const audioPreference = selectedPreference(2);
    await restartPlayback(choice, quality, async () => {
      await putSubtitleStream(choice.part.id, choice.stream.id);
      if (audioPreference)
        await applyTrackPreferences(choice, audioPreference, null);
    });
  };

  const disableSubtitles = async () => {
    if (!metadata || !activeVersion) return;
    void useUserSettings.getState().setSetting(
      `MEDIA_PREF_SUBTITLE-${preferenceScope(metadata)}`,
      JSON.stringify({ index: -1, title: "None" } satisfies TrackPreference),
    );
    await restartPlayback(activeVersion, quality, () =>
      putSubtitleStream(activeVersion.part.id, 0),
    );
  };

  const downloadOnDemandSubtitle = async (subtitle: SubtitleSearchResult) => {
    if (!itemID || !metadata || !activeVersion)
      throw new Error("No active media file is available.");

    await downloadSubtitle(
      metadata.ratingKey,
      activeVersion.media.id,
      subtitle,
    );

    for (let attempt = 0; attempt < 40; attempt += 1) {
      if (attempt > 0)
        await new Promise((resolve) => window.setTimeout(resolve, 500));

      const refreshed = await getLibraryMeta(itemID);
      const choice = findAttachedSubtitle(
        refreshed,
        activeVersion.media.id,
        subtitle,
      );
      if (!choice) continue;

      await selectSubtitleTrack(choice);
      setTunePage(3);
      return;
    }

    throw new Error(
      "Plex accepted the download, but the subtitle did not become available in time.",
    );
  };

  return (
    <>
      <Backdrop
        open={showError !== false}
        sx={{
          zIndex: 10000,
          backdropFilter: "blur(8px)",
        }}
      >
        <Paper
          elevation={10}
          sx={{
            p: 4,
            background: "#121216",
            color: theme.palette.text.primary,
            borderRadius: 2,
            maxWidth: "500px",
            width: "90%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            border: `1px solid ${theme.palette.divider}`,
          }}
        >
          <Typography variant="h6" sx={{ mb: 3, textAlign: "center" }}>
            {showError}
          </Typography>
          <Box
            sx={{
              display: "flex",
              flexDirection: "row",
              gap: 2,
              width: "100%",
              justifyContent: "center",
            }}
          >
            <Button
              variant="outlined"
              color="primary"
              onClick={() => {
                setShowError(false);

                // If the video is already 5 seconds in, reload the page with the current time
                if (player.current?.getCurrentTime() ?? 0 > 5) {
                  const url = new URL(window.location.href);
                  url.searchParams.set(
                    "t",
                    Math.floor(
                      (player.current?.getCurrentTime() ?? 0) * 1000,
                    ).toString(),
                  );
                  window.location.href = url.toString();
                } else window.location.reload();
              }}
            >
              Reload
            </Button>
            <Button
              variant="outlined"
              color="secondary"
              onClick={() => {
                setShowError(false);
                if (!metadata) return navigate("/");

                if (metadata.type === "movie")
                  navigate(
                    `/browse/${metadata.librarySectionID}?${queryBuilder({
                      mid: metadata.ratingKey,
                    })}`,
                  );

                if (metadata.type === "episode")
                  navigate(
                    `/browse/${metadata.librarySectionID}?${queryBuilder({
                      mid: metadata.grandparentRatingKey,
                    })}`,
                  );
              }}
            >
              Home
            </Button>
            <Button
              variant="text"
              onClick={() => {
                setShowError(false);
              }}
            >
              Ignore
            </Button>
          </Box>
        </Paper>
      </Backdrop>
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
          width: "100%",
          overflow: "hidden",
        }}
      >
        <Box
          sx={{
            display: buffering ? "flex" : "none",
            zIndex: 2,
            position: "absolute",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            overflow: "hidden",
            pointerEvents: "none",
          }}
        >
          <CenteredSpinner />
        </Box>
        <Box
          sx={{
            width: "100vw",
            height: "100vh",
            position: "absolute",
            padding: "10px",
            left: "0",
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "flex-start",
            px: "8vw",
            gap: "4vw",
            opacity: showInfo ? 1 : 0,
            transition: "all 0.6s cubic-bezier(0.23, 1, 0.32, 1)",
            zIndex: 1000,
            pointerEvents: "none",
            ...(metadata &&
              metadata?.type === "movie" && {
                justifyContent: "center",
                padding: "0",
              }),
          }}
        >
          <img
            src={`${getTranscodeImageURL(
              metadata?.thumb as string,
              1500,
              1500,
            )}`}
            alt=""
            style={{
              height: "25vw",
              width: "auto",
              objectFit: "cover",
              borderRadius: "1rem",
              boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
              transform: `translateX(${
                showInfo ? 0 : -40
              }vw) perspective(1000px) rotateY(${showInfo ? 0 : -30}deg)`,
              transition: "transform 0.7s cubic-bezier(0.23, 1, 0.32, 1)",
              transitionDelay: "0.2s",
              border: "2px solid rgba(255,255,255,0.1)",
            }}
          />
          <Box
            sx={{
              width: "45vw",
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              justifyContent: "center",
              textAlign: "left",
              transform: `translateX(${showInfo ? 0 : -80}vw)`,
              transition: "transform 0.6s cubic-bezier(0.23, 1, 0.32, 1)",
              transitionDelay: "0.1s",
            }}
          >
            {metadata && metadata?.type === "episode" && (
              <>
                <Typography
                  sx={{
                    fontSize: "0.9vw",
                    color: theme.palette.primary.main,
                    fontWeight: 500,
                    letterSpacing: "0.05em",
                    textTransform: "uppercase",
                    mb: 0.5,
                  }}
                >
                  {showmetadata?.childCount &&
                    showmetadata?.childCount > 1 &&
                    `Season ${metadata.parentIndex}`}
                </Typography>

                <Typography
                  sx={{
                    fontSize: "2.5vw",
                    fontWeight: 700,
                    color: "#FFF",
                    letterSpacing: "-0.01em",
                    lineHeight: 1.1,
                    textShadow: "0 2px 4px rgba(0,0,0,0.3)",
                  }}
                >
                  {metadata?.grandparentTitle}
                </Typography>

                <Typography
                  sx={{
                    fontSize: "1.2vw",
                    fontWeight: 600,
                    color: "rgba(255,255,255,0.9)",
                    mt: 2,
                    mb: 0.5,
                  }}
                >
                  {metadata?.title}{" "}
                  <span style={{ opacity: 0.6 }}>· EP.{metadata?.index}</span>
                </Typography>

                <Box
                  sx={{
                    display: "flex",
                    flexDirection: "row",
                    alignItems: "center",
                    flexWrap: "wrap",
                    justifyContent: "flex-start",
                    mt: 0,
                    mb: 1,
                    gap: 2,
                  }}
                >
                  {metadata.year && (
                    <Typography
                      sx={{
                        fontSize: "0.8vw",
                        fontWeight: 400,
                        color: "rgba(255,255,255,0.7)",
                      }}
                    >
                      {metadata.year}
                    </Typography>
                  )}
                  {metadata.rating && (
                    <Typography
                      sx={{
                        fontSize: "0.8vw",
                        fontWeight: 400,
                        color: "rgba(255,255,255,0.7)",
                      }}
                    >
                      {metadata.rating}
                    </Typography>
                  )}
                  {metadata.contentRating && (
                    <Typography
                      sx={{
                        fontSize: "0.7vw",
                        fontWeight: 500,
                        color: "rgba(255,255,255,0.9)",
                        border: `1px solid rgba(255,255,255,0.3)`,
                        borderRadius: "4px",
                        px: 1,
                        py: 0.3,
                      }}
                    >
                      {metadata.contentRating}
                    </Typography>
                  )}
                  {metadata.duration &&
                    ["episode", "movie"].includes(metadata.type) && (
                      <Typography
                        sx={{
                          fontSize: "0.9vw",
                          fontWeight: 400,
                          color: "rgba(255,255,255,0.7)",
                        }}
                      >
                        {durationToText(metadata.duration)}
                      </Typography>
                    )}
                </Box>

                <Typography
                  sx={{
                    fontSize: "1vw",
                    color: "rgba(255,255,255,0.8)",
                    lineHeight: 1.6,
                    maxWidth: "90%",
                    position: "relative",
                    "&:before": {
                      content: '""',
                      position: "absolute",
                      left: "-20px",
                      top: "8px",
                      bottom: "8px",
                      width: "3px",
                      background: theme.palette.primary.main,
                      borderRadius: "4px",
                      opacity: 0.8,
                    },
                  }}
                >
                  {metadata?.summary}
                </Typography>
              </>
            )}
            {metadata && metadata?.type === "movie" && (
              <>
                <Typography
                  sx={{
                    fontSize: "3.5vw",
                    fontWeight: 700,
                    color: "#FFF",
                    letterSpacing: "-0.02em",
                    lineHeight: 1.1,
                    textShadow: "0 2px 4px rgba(0,0,0,0.3)",
                  }}
                >
                  {metadata?.title}
                </Typography>

                <Box
                  sx={{
                    display: "flex",
                    flexDirection: "row",
                    alignItems: "center",
                    flexWrap: "wrap",
                    justifyContent: "flex-start",
                    mt: 2,
                    mb: 3,
                    gap: 2,
                  }}
                >
                  {metadata.year && (
                    <Typography
                      sx={{
                        fontSize: "0.8vw",
                        fontWeight: 400,
                        color: "rgba(255,255,255,0.7)",
                      }}
                    >
                      {metadata.year}
                    </Typography>
                  )}
                  {metadata.rating && (
                    <Typography
                      sx={{
                        fontSize: "0.8vw",
                        fontWeight: 400,
                        color: "rgba(255,255,255,0.7)",
                      }}
                    >
                      {metadata.rating}
                    </Typography>
                  )}
                  {metadata.contentRating && (
                    <Typography
                      sx={{
                        fontSize: "0.7vw",
                        fontWeight: 500,
                        color: "rgba(255,255,255,0.9)",
                        border: `1px solid rgba(255,255,255,0.3)`,
                        borderRadius: "4px",
                        px: 1,
                        py: 0.3,
                      }}
                    >
                      {metadata.contentRating}
                    </Typography>
                  )}
                  {metadata.duration &&
                    ["episode", "movie"].includes(metadata.type) && (
                      <Typography
                        sx={{
                          fontSize: "0.8vw",
                          fontWeight: 400,
                          color: "rgba(255,255,255,0.7)",
                        }}
                      >
                        {durationToText(metadata.duration)}
                      </Typography>
                    )}
                </Box>

                {metadata?.tagline && (
                  <Typography
                    sx={{
                      fontSize: "1vw",
                      fontWeight: 600,
                      color: theme.palette.primary.main,
                      mt: 1,
                      mb: 2,
                      fontStyle: "italic",
                    }}
                  >
                    {metadata?.tagline}
                  </Typography>
                )}
                <Typography
                  sx={{
                    fontSize: "1vw",
                    color: "rgba(255,255,255,0.8)",
                    lineHeight: 1.6,
                    maxWidth: "90%",
                    position: "relative",
                    "&:before": {
                      content: '""',
                      position: "absolute",
                      left: "-20px",
                      top: "8px",
                      bottom: "8px",
                      width: "3px",
                      background: theme.palette.primary.main,
                      borderRadius: "4px",
                      opacity: 0.8,
                    },
                  }}
                >
                  {metadata?.summary}
                </Typography>
              </>
            )}
          </Box>
        </Box>

        <Popover
          open={showTune}
          anchorEl={tuneButtonRef.current}
          onClose={() => {
            setShowTune(false);
            setTunePage(0);
          }}
          anchorOrigin={{
            vertical: "top",
            horizontal: "center",
          }}
          transformOrigin={{
            vertical: "bottom",
            horizontal: "center",
          }}
          sx={{
            "& .MuiPaper-root": {
              overflow: "hidden",
              borderRadius: 1,
              background: "transparent",
            },
          }}
        >
          <Paper
            sx={{
              width:
                tunePage === 4
                  ? { xs: "calc(100vw - 24px)", sm: 520 }
                  : 350,
              maxWidth: "calc(100vw - 24px)",
              maxHeight: "min(70vh, 600px)",
              overflowY: "auto",
              userSelect: "none",
              backdropFilter: "blur(20px)",
              border: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
            }}
          >
            {tunePage === 0 && (
              <>
                {TuneSettingTab(theme, setTunePage, {
                  pageNum: 1,
                  text: "Video",
                })}
                {TuneSettingTab(theme, setTunePage, {
                  pageNum: 2,
                  text: "Audio",
                })}
                {TuneSettingTab(theme, setTunePage, {
                  pageNum: 3,
                  text: "Subtitles",
                })}
              </>
            )}

            {tunePage === 1 && activeVersion && (
              <>
                {TuneSettingTab(theme, setTunePage, {
                  pageNum: 0,
                  text: "Back",
                })}
                {mediaVersions.length > 1 && (
                  <>
                    <TuneSectionLabel>Source</TuneSectionLabel>
                    {mediaVersions.map((version) => (
                      <TuneOption
                        key={version.media.id || version.mediaIndex}
                        selected={version.mediaIndex === activeMediaIndex}
                        primary={`Version ${version.mediaIndex + 1}`}
                        secondary={mediaVersionDetails(version)}
                        onClick={async () => {
                          setTunePage(0);
                          await selectMediaVersion(version);
                        }}
                      />
                    ))}
                    <Divider />
                  </>
                )}
                <TuneSectionLabel>Streaming quality</TuneSectionLabel>
                {getCurrentVideoLevels(
                  activeVersion.media.videoResolution,
                  `${Math.floor(activeVersion.media.bitrate / 1000)}Mbps`,
                ).map((qualityOption) => (
                  <TuneOption
                    key={`${qualityOption.title}:${qualityOption.bitrate}`}
                    selected={qualityOption.bitrate === quality.bitrate}
                    primary={qualityOption.title}
                    secondary={qualityOption.extra}
                    onClick={async () => {
                      setTunePage(0);
                      const nextQuality = {
                        bitrate: qualityOption.original
                          ? undefined
                          : qualityOption.bitrate,
                        auto: undefined,
                      };
                      setQuality(nextQuality);
                      if (qualityOption.original)
                        localStorage.removeItem("quality");
                      else if (qualityOption.bitrate)
                        localStorage.setItem(
                          "quality",
                          qualityOption.bitrate.toString(),
                        );
                      await restartPlayback(activeVersion, nextQuality);
                    }}
                  />
                ))}
              </>
            )}

            {tunePage === 2 && activeVersion && (
              <>
                {TuneSettingTab(theme, setTunePage, {
                  pageNum: 0,
                  text: "Back",
                })}
                {audioChoices.map((choice) => (
                  <TuneOption
                    key={`${choice.mediaIndex}:${choice.part.id}:${choice.stream.id}`}
                    selected={
                      choice.mediaIndex === activeMediaIndex &&
                      Boolean(choice.stream.selected)
                    }
                    primary={
                      choice.stream.extendedDisplayTitle ||
                      choice.stream.displayTitle ||
                      `Audio ${choice.stream.index + 1}`
                    }
                    secondary={
                      mediaVersions.length > 1
                        ? `Version ${choice.mediaIndex + 1} · ${mediaVersionDetails(choice)}`
                        : undefined
                    }
                    onClick={async () => {
                      setTunePage(0);
                      await selectAudioTrack(choice);
                    }}
                  />
                ))}
              </>
            )}

            {tunePage === 3 && activeVersion && (
              <>
                {TuneSettingTab(theme, setTunePage, {
                  pageNum: 0,
                  text: "Back",
                })}
                <TuneOption
                  selected={
                    !activeVersion.part.Stream?.some(
                      (stream) => stream.streamType === 3 && stream.selected,
                    )
                  }
                  primary="None"
                  onClick={async () => {
                    setTunePage(0);
                    await disableSubtitles();
                  }}
                />
                {subtitleChoices.map((choice) => (
                  <TuneOption
                    key={`${choice.mediaIndex}:${choice.part.id}:${choice.stream.id}`}
                    selected={
                      choice.mediaIndex === activeMediaIndex &&
                      Boolean(choice.stream.selected)
                    }
                    primary={
                      choice.stream.extendedDisplayTitle ||
                      choice.stream.displayTitle ||
                      `Subtitle ${choice.stream.index + 1}`
                    }
                    secondary={
                      mediaVersions.length > 1
                        ? `Version ${choice.mediaIndex + 1} · ${mediaVersionDetails(choice)}`
                        : undefined
                    }
                    onClick={async () => {
                      setTunePage(0);
                      await selectSubtitleTrack(choice);
                    }}
                  />
                ))}
                <Divider />
                <TuneAction
                  icon={<SearchRounded fontSize="small" />}
                  primary="Find subtitles…"
                  secondary="Search Plex subtitle providers"
                  onClick={() => setTunePage(4)}
                />
              </>
            )}

            {tunePage === 4 && activeVersion && metadata && (
              <>
                {TuneSettingTab(theme, setTunePage, {
                  pageNum: 3,
                  text: "Find subtitles",
                })}
                <SubtitleSearchPanel
                  key={`${metadata.ratingKey}:${activeVersion.media.id}:${activeVersion.part.id}`}
                  metadata={metadata}
                  version={activeVersion}
                  onDownload={downloadOnDemandSubtitle}
                />
              </>
            )}
          </Paper>
        </Popover>
        {(() => {
          if (!metadata) return <CenteredSpinner />;

          return (
            <>
              <Fade
                mountOnEnter
                unmountOnExit
                in={
                  (room ? isHost : true) &&
                  metadata.Marker &&
                  metadata.Marker.filter(
                    (marker) =>
                      marker.startTimeOffset / 1000 <= progress &&
                      marker.endTimeOffset / 1000 >= progress &&
                      marker.type === "intro",
                  ).length > 0
                }
              >
                <Box
                  sx={{
                    position: "absolute",
                    bottom: `${
                      (playbackBarRef.current?.clientHeight ?? 0) + 40
                    }px`,
                    right: "40px",
                    zIndex: 2,
                  }}
                >
                  <Button
                    sx={{
                      px: 3,
                      py: 1.5,
                      backgroundColor: "rgba(0,0,0,0.8)",
                      backdropFilter: "blur(20px)",
                      border: `1px solid ${alpha(theme.palette.divider, 0.3)}`,
                      color: "#fff",
                      "&:hover": {
                        backgroundColor: "rgba(0,0,0,0.9)",
                        transform: "translateY(-2px)",
                        boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
                        border: `1px solid ${alpha(
                          theme.palette.primary.main,
                          0.5,
                        )}`,
                      },
                    }}
                    variant="contained"
                    onClick={() => {
                      if (!player.current || !metadata?.Marker) return;
                      const time =
                        metadata.Marker?.filter(
                          (marker) =>
                            marker.startTimeOffset / 1000 <= progress &&
                            marker.endTimeOffset / 1000 >= progress &&
                            marker.type === "intro",
                        )[0].endTimeOffset / 1000;
                      player.current.seekTo(time + 1);
                    }}
                  >
                    <Box
                      sx={{
                        display: "flex",
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 1.5,
                      }}
                    >
                      <SkipNext sx={{ fontSize: 18 }} />
                      <Typography
                        sx={{
                          fontSize: "0.875rem",
                          fontWeight: 600,
                          letterSpacing: "0.025em",
                        }}
                      >
                        Skip Intro
                      </Typography>
                    </Box>
                  </Button>
                </Box>
              </Fade>

              <Fade
                mountOnEnter
                unmountOnExit
                in={
                  (room ? isHost : true) &&
                  metadata.Marker &&
                  metadata.Marker.filter(
                    (marker) =>
                      marker.startTimeOffset / 1000 <= progress &&
                      marker.endTimeOffset / 1000 >= progress &&
                      marker.type === "credits" &&
                      !marker.final,
                  ).length > 0
                }
              >
                <Box
                  sx={{
                    position: "absolute",
                    bottom: `${
                      (playbackBarRef.current?.clientHeight ?? 0) + 40
                    }px`,
                    right: "40px",
                    zIndex: 2,
                  }}
                >
                  <Button
                    sx={{
                      px: 3,
                      py: 1.5,
                      backgroundColor: "rgba(0,0,0,0.8)",
                      backdropFilter: "blur(20px)",
                      border: `1px solid ${alpha(theme.palette.divider, 0.3)}`,
                      color: "#fff",
                      "&:hover": {
                        backgroundColor: "rgba(0,0,0,0.9)",
                        transform: "translateY(-2px)",
                        boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
                        border: `1px solid ${alpha(
                          theme.palette.primary.main,
                          0.5,
                        )}`,
                      },
                    }}
                    variant="contained"
                    onClick={() => {
                      if (!player.current || !metadata?.Marker) return;
                      const time =
                        metadata.Marker?.filter(
                          (marker) =>
                            marker.startTimeOffset / 1000 <= progress &&
                            marker.endTimeOffset / 1000 >= progress &&
                            marker.type === "credits" &&
                            !marker.final,
                        )[0].endTimeOffset / 1000;
                      player.current.seekTo(time + 1);
                    }}
                  >
                    <Box
                      sx={{
                        display: "flex",
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 1.5,
                      }}
                    >
                      <SkipNext sx={{ fontSize: 18 }} />
                      <Typography
                        sx={{
                          fontSize: "0.875rem",
                          fontWeight: 600,
                          letterSpacing: "0.025em",
                        }}
                      >
                        Skip Credits
                      </Typography>
                    </Box>
                  </Button>
                </Box>
              </Fade>

              <Fade
                mountOnEnter
                unmountOnExit
                in={
                  (room ? isHost : true) &&
                  metadata.Marker &&
                  metadata.Marker.filter(
                    (marker) =>
                      marker.startTimeOffset / 1000 <= progress &&
                      marker.endTimeOffset / 1000 >= progress &&
                      marker.type === "credits" &&
                      marker.final,
                  ).length > 0
                }
              >
                <Box
                  sx={{
                    position: "absolute",
                    bottom: `${
                      (playbackBarRef.current?.clientHeight ?? 0) + 40
                    }px`,
                    right: "40px",
                    zIndex: 2,
                  }}
                >
                  <PlaybackNextEPButton
                    player={player}
                    playbackBarRef={playbackBarRef}
                    metadata={metadata}
                    playQueue={playQueue}
                    navigate={navigate}
                    playing={playing}
                  />
                </Box>
              </Fade>

              <Fade
                in={showControls || !playing || controlElementsVisible}
                style={{
                  transitionDuration: "1s",
                }}
              >
                <Box
                  sx={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    zIndex: 1,
                    width: "100vw",
                    height: "100vh",
                    display: "flex",
                    flexDirection: "column",
                    overflow: "hidden",
                    background:
                      settings["DISABLE_WATCHSCREEN_DARKENING"] === "true"
                        ? "transparent"
                        : "linear-gradient(180deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.3) 40%, rgba(0,0,0,0.3) 60%, rgba(0,0,0,0.8) 100%)",
                    pointerEvents: "none",
                  }}
                >
                  <Box
                    sx={{
                      mt: 3,
                      mx: 3,
                      display: "flex",
                      flexDirection: "row",
                      justifyContent: "flex-start",
                      alignItems: "center",
                      pointerEvents: "all",
                    }}
                  >
                    <IconButton
                      onClick={() => {
                        if (room && !isHost) socket?.disconnect();
                        if (room && isHost)
                          socket?.emit("RES_SYNC_PLAYBACK_END");

                        if (itemID && player.current)
                          getTimelineUpdate(
                            parseInt(itemID),
                            Math.floor(player.current?.getDuration() * 1000),
                            "stopped",
                            Math.floor(player.current?.getCurrentTime() * 1000),
                          );
                        if (metadata.type === "movie")
                          navigate(
                            `/browse/${
                              metadata.librarySectionID
                            }?${queryBuilder({
                              mid: metadata.ratingKey,
                            })}`,
                          );

                        if (metadata.type === "episode")
                          navigate(
                            `/browse/${
                              metadata.librarySectionID
                            }?${queryBuilder({
                              mid: metadata.grandparentRatingKey,
                            })}`,
                          );
                      }}
                      sx={{
                        width: 48,
                        height: 48,
                        backgroundColor: "rgba(0,0,0,0.6)",
                        backdropFilter: "blur(20px)",
                        border: `1px solid ${alpha(
                          theme.palette.divider,
                          0.2,
                        )}`,
                        "&:hover": {
                          backgroundColor: "rgba(0,0,0,0.8)",
                          transform: "scale(1.05)",
                        },
                      }}
                    >
                      <ArrowBackIosNewRounded fontSize="medium" />
                    </IconButton>
                  </Box>

                  {/* Standalone Backdrop Blur Background */}
                  <Box
                    sx={{
                      position: "absolute",
                      left: 0,
                      right: 0,
                      height: playbackBarRef.current?.clientHeight || 200,
                      background:
                        "linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.9) 100%)",
                      backdropFilter: "blur(20px)",
                      WebkitBackdropFilter: "blur(20px)",
                      zIndex: -1,
                      borderTop: `1px solid ${alpha(
                        theme.palette.divider,
                        0.1,
                      )}`,
                      transition: "bottom 0.5s ease",
                    }}
                    style={{
                      bottom:
                        showControls || !playing
                          ? 0
                          : -(playbackBarRef.current?.clientHeight || 200),
                    }}
                  />

                  <Box
                    ref={playbackBarRef}
                    sx={{
                      mt: "auto",
                      mb: 0,
                      mx: 0,
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                      alignItems: "center",
                      pointerEvents: "all",
                      px: 4,
                      py: 2,

                      transition: "transform 0.5s ease",
                    }}
                    style={{
                      transform:
                        showControls || !playing
                          ? "translateY(0)"
                          : "translateY(100%)",
                    }}
                  >
                    {/* Progress Bar Section */}
                    <Box
                      sx={{
                        width: "100%",
                        display: "flex",
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 3,
                        mb: 2,
                      }}
                    >
                      <Typography
                        variant="caption"
                        sx={{
                          minWidth: "45px",
                          textAlign: "center",
                          fontSize: "0.75rem",
                          color: "rgba(255,255,255,0.8)",
                          fontWeight: 500,
                        }}
                      >
                        {getFormatedTime(progress)}
                      </Typography>

                      <Box
                        sx={{
                          flex: 1,
                          height: "18px",
                          position: "relative",
                        }}
                      >
                        <VideoSeekSlider
                          max={(player.current?.getDuration() ?? 0) * 1000}
                          currentTime={progress * 1000}
                          bufferTime={buffered * 1000}
                          onChange={(value) => {
                            player.current?.seekTo(value / 1000);
                            socket?.emit("EVNT_SYNC_SEEK", value / 1000);
                          }}
                          getPreviewScreenUrl={(value) => {
                            if (!activeVersion?.part.indexes) return "";
                            return getTranscodeImageURL(
                              `/library/parts/${activeVersion.part.id}/indexes/sd/${value}`,
                              240,
                              135,
                            );
                          }}
                        />
                      </Box>

                      <Typography
                        variant="caption"
                        sx={{
                          minWidth: "45px",
                          textAlign: "center",
                          fontSize: "0.75rem",
                          color: "rgba(255,255,255,0.8)",
                          fontWeight: 500,
                        }}
                      >
                        {getFormatedTime(
                          (player.current?.getDuration() ?? 0) - progress,
                        )}
                      </Typography>
                    </Box>

                    {/* Controls Section */}
                    <Box
                      sx={{
                        display: "flex",
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                        width: "100%",
                      }}
                    >
                      {/* Left Controls */}
                      <Box
                        sx={{
                          display: "flex",
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 1,
                        }}
                      >
                        <IconButton
                          onClick={() => {
                            setPlaying(!playing);
                            if (playing) socket?.emit("EVNT_SYNC_PAUSE");
                            else socket?.emit("EVNT_SYNC_RESUME");
                          }}
                          onKeyDown={(e) => {
                            e.preventDefault();
                          }}
                          sx={{
                            width: 48,
                            height: 48,
                            backgroundColor: "rgba(255,255,255,0.1)",
                            "&:hover": {
                              backgroundColor: "rgba(255,255,255,0.2)",
                              transform: "scale(1.05)",
                            },
                          }}
                        >
                          {playing ? (
                            <PauseRounded fontSize="medium" />
                          ) : (
                            <PlayArrowRounded fontSize="medium" />
                          )}
                        </IconButton>

                        {playQueue && !(room && !isHost) && (
                          <NextEPButton queue={playQueue} />
                        )}
                      </Box>

                      {/* Center Title */}
                      <Box
                        sx={{
                          flex: 1,
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "center",
                          textAlign: "center",
                          mx: 4,
                        }}
                      >
                        {metadata.type === "movie" && (
                          <Typography
                            variant="h6"
                            sx={{
                              fontSize: "1rem",
                              fontWeight: 600,
                              color: "#fff",
                              textOverflow: "ellipsis",
                              overflow: "hidden",
                              whiteSpace: "nowrap",
                              maxWidth: "100%",
                            }}
                          >
                            {metadata.title}
                          </Typography>
                        )}

                        {metadata.type === "episode" && (
                          <>
                            <Typography
                              variant="body2"
                              sx={{
                                fontSize: "0.75rem",
                                color: "rgba(255,255,255,0.7)",
                                textOverflow: "ellipsis",
                                overflow: "hidden",
                                whiteSpace: "nowrap",
                                maxWidth: "100%",
                              }}
                            >
                              {metadata.grandparentTitle}
                            </Typography>
                            <Typography
                              variant="h6"
                              sx={{
                                fontSize: "0.9rem",
                                fontWeight: 600,
                                color: "#fff",
                                textOverflow: "ellipsis",
                                overflow: "hidden",
                                whiteSpace: "nowrap",
                                maxWidth: "100%",
                                mt: 0.5,
                              }}
                            >
                              S{metadata.parentIndex}E{metadata.index} •{" "}
                              {metadata.title}
                            </Typography>
                          </>
                        )}
                      </Box>

                      {/* Right Controls */}
                      <Box
                        sx={{
                          display: "flex",
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 1,
                        }}
                      >
                        <IconButton
                          onKeyDown={(e) => {
                            e.preventDefault();
                          }}
                          onClick={(event) => {
                            setVolumePopoverAnchor(event.currentTarget);
                          }}
                          sx={{
                            width: 40,
                            height: 40,
                          }}
                        >
                          <VolumeUpRounded fontSize="small" />
                        </IconButton>

                        {metadata.type === "episode" && !(room && !isHost) && (
                          <WatchShowChildView
                            item={metadata}
                            controlElementsVisibleState={[
                              controlElementsVisible,
                              setControlElementsVisible,
                            ]}
                          />
                        )}

                        <IconButton
                          onKeyDown={(e) => {
                            e.preventDefault();
                          }}
                          onClick={(event) => {
                            setShowTune(!showTune);
                            setTunePage(0);
                            tuneButtonRef.current = event.currentTarget;
                          }}
                        >
                          <TuneRounded fontSize="small" />
                        </IconButton>

                        {room && (
                          <IconButton
                            onKeyDown={(e) => {
                              e.preventDefault();
                            }}
                            onClick={() => {
                              setSyncInterfaceOpen(true);
                            }}
                          >
                            <PeopleRounded fontSize="small" />
                          </IconButton>
                        )}

                        <IconButton
                          onKeyDown={(e) => {
                            e.preventDefault();
                          }}
                          onClick={() => {
                            if (!document.fullscreenElement)
                              document.documentElement.requestFullscreen();
                            else document.exitFullscreen();
                          }}
                        >
                          <FullscreenRounded fontSize="small" />
                        </IconButton>
                      </Box>
                    </Box>

                    {/* Volume Popover */}
                    <Popover
                      open={volumePopoverOpen}
                      anchorEl={volumePopoverAnchor}
                      onClose={() => {
                        setVolumePopoverAnchor(null);
                      }}
                      anchorOrigin={{
                        vertical: "top",
                        horizontal: "center",
                      }}
                      transformOrigin={{
                        vertical: "bottom",
                        horizontal: "center",
                      }}
                      elevation={0}
                      sx={{
                        userSelect: "none",
                        "& .MuiPaper-root": {
                          overflow: "hidden",
                          borderRadius: 1,
                          background: "transparent",
                        },
                      }}
                    >
                      <Paper
                        sx={{
                          height: "auto",
                          userSelect: "none",
                          backgroundColor: "#00000088",
                          backdropFilter: "blur(20px)",
                          border: `1px solid ${alpha(
                            theme.palette.divider,
                            0.1,
                          )}`,
                          py: 3,
                          px: 2,
                        }}
                      >
                        <Slider
                          sx={{
                            height: "100px",
                            "& .MuiSlider-thumb": {
                              width: 16,
                              height: 16,
                              backgroundColor: theme.palette.primary.main,
                              border: "2px solid rgba(255,255,255,0.3)",
                            },
                            "& .MuiSlider-track": {
                              backgroundColor: theme.palette.primary.main,
                              border: "none",
                              width: 4,
                            },
                            "& .MuiSlider-rail": {
                              backgroundColor: "rgba(255,255,255,0.2)",
                              width: 4,
                            },
                          }}
                          value={volume}
                          onChange={(event, value) => {
                            setVolume(value as number);
                            localStorage.setItem("volume", value.toString());
                          }}
                          aria-labelledby="continuous-slider"
                          min={0}
                          max={100}
                          step={1}
                          orientation="vertical"
                        />
                      </Paper>
                    </Popover>
                  </Box>
                </Box>
              </Fade>

              <ReactPlayer
                ref={player}
                playing={playing}
                volume={volume / 100}
                progressInterval={500}
                onClick={(e: MouseEvent) => {
                  e.preventDefault();

                  switch (e.detail) {
                    case 1:
                      setPlaying((state) => {
                        if (state) socket?.emit("EVNT_SYNC_PAUSE");
                        else socket?.emit("EVNT_SYNC_RESUME");
                        return !state;
                      });
                      break;
                    case 2:
                      if (!document.fullscreenElement) {
                        document.documentElement.requestFullscreen();
                        setPlaying(true);
                        socket?.emit("EVNT_SYNC_RESUME");
                      } else document.exitFullscreen();
                      break;
                    default:
                      break;
                  }
                }}
                onReady={() => {
                  if (!player.current) return;
                  setReady(true);

                  if (seekToAfterLoad.current !== null) {
                    player.current.seekTo(seekToAfterLoad.current);
                    seekToAfterLoad.current = null;
                  }

                  const seekTo = params.has("t")
                    ? parseInt(params.get("t") as string)
                    : ((metadata?.viewOffset && metadata?.viewOffset > 5
                        ? metadata?.viewOffset
                        : null) ?? null);

                  if (!seekTo) return;
                  if (lastAppliedTime.current === seekTo) return;
                  player.current.seekTo(seekTo / 1000);
                  lastAppliedTime.current = seekTo;
                }}
                onProgress={(progress) => {
                  setProgress(progress.playedSeconds);
                  setBuffered(progress.loadedSeconds);
                }}
                onPause={() => {
                  setPlaying(false);
                }}
                onPlay={() => {
                  setPlaying(true);
                }}
                onBuffer={() => {
                  setBuffering(true);
                }}
                onBufferEnd={() => {
                  setBuffering(false);
                }}
                onError={(err) => {
                  console.log("Player error:");
                  console.error(err);
                  // window.location.reload();

                  setPlaying(false);
                  socket?.emit("EVNT_SYNC_PAUSE");
                  if (showError) return;

                  // filter out links from the error messages
                  if (!err.error) return;
                  const message = err.error.message.replace(
                    /https?:\/\/[^\s]+/g,
                    "Media",
                  );

                  setShowError(message);
                }}
                config={{
                  file: {
                    hlsVersion: "1.6.7",
                    dashVersion: "4.7.4",
                    attributes: {
                      controlsList: "nodownload",
                      disablePictureInPicture: true,
                      disableRemotePlayback: true,
                      autoplay: true,
                    },
                  },
                }}
                onEnded={() => {
                  if (room && !isHost) return;
                  if (!playQueue) return console.log("No play queue");

                  if (metadata.type !== "episode") {
                    if (room && isHost) socket?.emit("RES_SYNC_PLAYBACK_END");
                    return navigate(
                      `/browse/${metadata.librarySectionID}?${queryBuilder({
                        mid: metadata.ratingKey,
                      })}`,
                    );
                  }

                  const next = playQueue[1];
                  if (!next) {
                    if (room && isHost) socket?.emit("RES_SYNC_PLAYBACK_END");
                    return navigate(
                      `/browse/${metadata.librarySectionID}?${queryBuilder({
                        mid: metadata.grandparentRatingKey,
                        pid: metadata.parentRatingKey,
                        iid: metadata.ratingKey,
                      })}`,
                    );
                  }

                  navigate(`/watch/${next.ratingKey}`);
                }}
                url={url}
                width="100%"
                height="100%"
              />
            </>
          );
        })()}
      </Box>
    </>
  );
}

export default Watch;

function NextEPButton({ queue }: { queue?: Plex.Metadata[] }) {
  const navigate = useNavigate();

  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  if (!queue) return <></>;

  return (
    <>
      <Popper
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        placement="top-start"
        transition
        sx={{
          zIndex: 10000,
          "& .MuiPaper-root": {
            overflow: "hidden",
            borderRadius: 1,
            background: "transparent",
          },
        }}
        modifiers={[
          {
            name: "offset",
            options: {
              offset: [0, 10],
            },
          },
        ]}
      >
        {({ TransitionProps }) => (
          <Fade {...TransitionProps} timeout={350}>
            <Paper
              sx={{
                width: "35vw",
                height: "auto",
                aspectRatio: "32/8",
                overflow: "hidden",

                display: "flex",
                flexDirection: "row",
                alignItems: "flex-start",
                justifyContent: "flex-start",
              }}
            >
              <img
                src={`${getTranscodeImageURL(queue[1].thumb, 500, 500)}`}
                alt=""
                style={{
                  height: "100%",
                  aspectRatio: "16/9",
                  width: "auto",
                }}
              />

              <Box
                sx={{
                  width: "100%",
                  height: "100%",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  justifyContent: "flex-start",
                  p: 2,

                  backgroundColor: "#00000088",
                }}
              >
                <Typography
                  sx={{
                    fontSize: "0.7vw",
                    fontWeight: "700",
                    letterSpacing: "0.15em",
                    color: (theme) => theme.palette.primary.main,
                    textTransform: "uppercase",
                  }}
                >
                  {queue[1].type}{" "}
                  {queue[1].type === "episode" && queue[1].index}
                </Typography>
                <Typography
                  sx={{
                    fontSize: "0.8vw",
                    fontWeight: "bold",
                    color: "#FFF",
                  }}
                >
                  {queue[1].title}
                </Typography>

                <Typography
                  sx={{
                    mt: "2px",
                    fontSize: "0.6vw",
                    color: "#FFF",

                    // max 5 lines
                    display: "-webkit-box",
                    WebkitLineClamp: 5,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {queue[1].summary}
                </Typography>
              </Box>
            </Paper>
          </Fade>
        )}
      </Popper>
      {queue && queue[1] && (
        <IconButton
          onClick={() => {
            navigate(`/watch/${queue[1].ratingKey}`);
          }}
          onKeyDown={(e) => {
            e.preventDefault();
          }}
          onMouseEnter={(e) => setAnchorEl(e.currentTarget)}
          onMouseLeave={() => setAnchorEl(null)}
        >
          <SkipNextRounded fontSize="small" />
        </IconButton>
      )}
    </>
  );
}

function TuneSectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <Typography
      variant="caption"
      color="text.secondary"
      sx={{ display: "block", px: 2, pt: 1.5, pb: 0.5 }}
    >
      {children}
    </Typography>
  );
}

function TuneOption({
  selected,
  primary,
  secondary,
  onClick,
}: {
  selected: boolean;
  primary: string;
  secondary?: string;
  onClick: () => void;
}) {
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: "24px minmax(0, 1fr)",
        alignItems: "center",
        gap: 1,
        width: "100%",
        minHeight: 50,
        px: 2,
        py: 1,
        cursor: "pointer",
        backgroundColor: "#00000088",
        "&:hover": { backgroundColor: "#000000ee" },
      }}
      onClick={onClick}
    >
      <CheckRounded
        sx={{ opacity: selected ? 1 : 0, color: "primary.main" }}
        fontSize="small"
      />
      <Box sx={{ minWidth: 0, textAlign: "right" }}>
        <Typography variant="body2" noWrap>{primary}</Typography>
        {secondary && (
          <Typography variant="caption" color="text.secondary" noWrap display="block">
            {secondary}
          </Typography>
        )}
      </Box>
    </Box>
  );
}

function TuneAction({
  icon,
  primary,
  secondary,
  onClick,
}: {
  icon: React.ReactNode;
  primary: string;
  secondary?: string;
  onClick: () => void;
}) {
  return (
    <Box
      component="button"
      type="button"
      sx={{
        display: "grid",
        gridTemplateColumns: "24px minmax(0, 1fr)",
        alignItems: "center",
        gap: 1,
        width: "100%",
        minHeight: 50,
        px: 2,
        py: 1,
        border: 0,
        color: "text.primary",
        cursor: "pointer",
        backgroundColor: "#00000088",
        "&:hover": { backgroundColor: "#000000ee" },
      }}
      onClick={onClick}
    >
      <Box sx={{ display: "flex", color: "primary.main" }}>{icon}</Box>
      <Box sx={{ minWidth: 0, textAlign: "right" }}>
        <Typography variant="body2" noWrap>{primary}</Typography>
        {secondary && (
          <Typography variant="caption" color="text.secondary" noWrap display="block">
            {secondary}
          </Typography>
        )}
      </Box>
    </Box>
  );
}

function TuneSettingTab(
  theme: Theme,
  setTunePage: React.Dispatch<React.SetStateAction<number>>,
  props: {
    pageNum: number;
    text: string;
  },
) {
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        width: "100%",
        height: 50,
        px: 2,
        py: 1.5,
        userSelect: "none",
        cursor: "pointer",
        transition: "all 0.3s ease-in-out",
        backgroundColor: "#00000088",
        "&:hover": {
          transition: "all 0s ease-in-out",
          backgroundColor: "#000000ee",
        },
      }}
      onClick={() => {
        setTunePage(props.pageNum);
      }}
    >
      <ArrowBackIosRounded
        sx={{
          fontSize: 18,
          color: "text.secondary",
        }}
      />
      <Typography
        variant="subtitle1"
        sx={{
          fontWeight: "medium",
          flex: 1,
          textAlign: "right",
          color: "text.primary",
        }}
      >
        {props.text}
      </Typography>
    </Box>
  );
}

export function getFormatedTime(time: number) {
  const hours = Math.floor(time / 3600);
  const minutes = Math.floor((time % 3600) / 60);
  const seconds = Math.floor(time % 60);

  // only show hours if there are any
  if (hours > 0)
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds
      .toString()
      .padStart(2, "0")}`;

  return `${minutes.toString().padStart(2, "0")}:${seconds
    .toString()
    .padStart(2, "0")}`;
}

export function getCurrentVideoLevels(
  resolution: string,
  extraForOriginal = "Auto",
) {
  const levels: {
    title: string;
    bitrate?: number;
    extra: string;
    original?: boolean;
  }[] = [];

  // if (platformCache.isDesktop)
  //   levels.push({
  //     title: "Direct Play (Original)",
  //     bitrate: -1,
  //     extra: extraForOriginal,
  //   });

  switch (resolution) {
    case "720":
      levels.push(
        ...[
          {
            title: "Convert to 720p",
            bitrate: 4000,
            extra: "(High) 4Mbps",
          },
          {
            title: "Convert to 720p",
            bitrate: 3000,
            extra: "(Medium) 3Mbps",
          },
          { title: "Convert to 720p", bitrate: 2000, extra: "2Mbps" },
          { title: "Convert to 480p", bitrate: 1500, extra: "1.5Mbps" },
          { title: "Convert to 360p", bitrate: 750, extra: "0.7Mbps" },
          { title: "Convert to 240p", bitrate: 300, extra: "0.3Mbps" },
        ],
      );
      break;
    case "4k":
      levels.push(
        ...[
          {
            title: "Convert to 4K",
            bitrate: 60000,
            extra: "(High) 60Mbps",
          },
          {
            title: "Convert to 4K",
            bitrate: 40000,
            extra: "(Medium) 40Mbps",
          },
          {
            title: "Convert to 4K",
            bitrate: 30000,
            extra: "30Mbps",
          },
          {
            title: "Convert to 1080p",
            bitrate: 20000,
            extra: "(High) 20Mbps",
          },
          {
            title: "Convert to 1080p",
            bitrate: 12000,
            extra: "(Medium) 12Mbps",
          },
          {
            title: "Convert to 1080p",
            bitrate: 8000,
            extra: "8Mbps",
          },
          {
            title: "Convert to 720p",
            bitrate: 4000,
            extra: "(High) 4Mbps",
          },
          {
            title: "Convert to 720p",
            bitrate: 3000,
            extra: "(Medium) 3Mbps",
          },
          { title: "Convert to 720p", bitrate: 2000, extra: "2Mbps" },
          { title: "Convert to 480p", bitrate: 1500, extra: "1.5Mbps" },
          { title: "Convert to 360p", bitrate: 750, extra: "0.7Mbps" },
          { title: "Convert to 240p", bitrate: 300, extra: "0.3Mbps" },
        ],
      );
      break;

    case "1080":
    default:
      levels.push(
        ...[
          {
            title: "Convert to 1080p",
            bitrate: 20000,
            extra: "(High) 20Mbps",
          },
          {
            title: "Convert to 1080p",
            bitrate: 12000,
            extra: "(Medium) 12Mbps",
          },
          {
            title: "Convert to 1080p",
            bitrate: 8000,
            extra: "8Mbps",
          },
          {
            title: "Convert to 720p",
            bitrate: 4000,
            extra: "(High) 4Mbps",
          },
          {
            title: "Convert to 720p",
            bitrate: 3000,
            extra: "(Medium) 3Mbps",
          },
          { title: "Convert to 720p", bitrate: 2000, extra: "2Mbps" },
          { title: "Convert to 480p", bitrate: 1500, extra: "1.5Mbps" },
          { title: "Convert to 360p", bitrate: 750, extra: "0.7Mbps" },
          { title: "Convert to 240p", bitrate: 300, extra: "0.3Mbps" },
        ],
      );
      break;
  }

  return levels;
}
