import { useCallback, useEffect, useRef } from "react";
import { useWatchTogetherDialog } from "./dialog";
import {
  createSharedPlaybackState,
  shouldCorrectPlaybackPosition,
} from "./playback";
import { useWatchTogetherSession } from "./session";

interface WatchTogetherPlaybackOptions {
  itemID?: string;
  playing: boolean;
  getCurrentTime: () => number;
  seekTo: (time: number) => void;
  setPlaying: (playing: boolean) => void;
  openRemotePlayback: (state: PerPlexed.Sync.PlayBackState) => void;
  onRemotePlaybackEnd: () => void;
}

export function useWatchTogetherPlayback(
  options: WatchTogetherPlaybackOptions,
) {
  const { room, socket, isHost, disconnect } = useWatchTogetherSession();
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    if (!socket || !isHost || !options.itemID) return;
    socket.emit(
      "RES_SYNC_SET_PLAYBACK",
      createSharedPlaybackState(
        options.itemID,
        options.playing,
        options.getCurrentTime(),
      ),
    );
  // The current state is sampled when the media changes; regular updates are
  // sent by the interval below.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost, options.itemID, socket]);

  useEffect(() => {
    if (!socket || !room) return;

    const sendHostState = () => {
      const current = optionsRef.current;
      if (!isHost || !current.itemID) return;
      socket.emit(
        "RES_SYNC_RESYNC_PLAYBACK",
        createSharedPlaybackState(
          current.itemID,
          current.playing,
          current.getCurrentTime(),
        ),
      );
    };

    const onResync = (
      _user: PerPlexed.Sync.Member,
      state: PerPlexed.Sync.PlayBackState,
    ) => {
      if (isHost) return;
      const current = optionsRef.current;
      if (state.key && state.key !== current.itemID) {
        current.openRemotePlayback(state);
        return;
      }
      if (
        shouldCorrectPlaybackPosition(current.getCurrentTime(), state.time)
      ) {
        current.seekTo(state.time as number);
      }
      if (state.state === "playing") current.setPlaying(true);
      if (state.state === "paused") current.setPlaying(false);
    };
    const onPlaybackEnd = () => {
      if (!isHost) optionsRef.current.onRemotePlaybackEnd();
    };
    const onPause = () => optionsRef.current.setPlaying(false);
    const onResume = () => optionsRef.current.setPlaying(true);
    const onSeek = (_user: PerPlexed.Sync.Member, time: number) =>
      optionsRef.current.seekTo(time);

    socket.on("RES_SYNC_RESYNC_PLAYBACK", onResync);
    socket.on("RES_SYNC_PLAYBACK_END", onPlaybackEnd);
    socket.on("EVNT_SYNC_PAUSE", onPause);
    socket.on("EVNT_SYNC_RESUME", onResume);
    socket.on("EVNT_SYNC_SEEK", onSeek);
    const interval = isHost ? setInterval(sendHostState, 2500) : undefined;

    return () => {
      socket.off("RES_SYNC_RESYNC_PLAYBACK", onResync);
      socket.off("RES_SYNC_PLAYBACK_END", onPlaybackEnd);
      socket.off("EVNT_SYNC_PAUSE", onPause);
      socket.off("EVNT_SYNC_RESUME", onResume);
      socket.off("EVNT_SYNC_SEEK", onSeek);
      if (interval) clearInterval(interval);
    };
  }, [isHost, room, socket]);

  const pause = useCallback(() => socket?.emit("EVNT_SYNC_PAUSE"), [socket]);
  const resume = useCallback(
    () => socket?.emit("EVNT_SYNC_RESUME"),
    [socket],
  );
  const seek = useCallback(
    (time: number) => socket?.emit("EVNT_SYNC_SEEK", time),
    [socket],
  );
  const end = useCallback(() => {
    if (room && isHost) socket?.emit("RES_SYNC_PLAYBACK_END");
  }, [isHost, room, socket]);
  const leave = useCallback(() => {
    if (!room) return;
    if (isHost) socket?.emit("RES_SYNC_PLAYBACK_END");
    else disconnect();
  }, [disconnect, isHost, room, socket]);
  const openDialog = useCallback(
    () => useWatchTogetherDialog.getState().setOpen(true),
    [],
  );

  return {
    room,
    isHost,
    isGuest: Boolean(room && !isHost),
    pause,
    resume,
    seek,
    end,
    leave,
    openDialog,
  };
}
