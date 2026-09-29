import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useWatchTogetherNotifications } from "../model/notifications";
import { sharedPlaybackPath } from "../model/playback";
import { useWatchTogetherSession } from "../model/session";

export default function WatchTogetherRuntime() {
  const { socket, isHost } = useWatchTogetherSession();
  const addNotification = useWatchTogetherNotifications((state) => state.add);
  const navigate = useNavigate();

  useEffect(() => {
    if (!socket) return;

    const onPlaybackSet = (
      user: PerPlexed.Sync.Member,
      playback: PerPlexed.Sync.PlayBackState,
    ) => {
      if (isHost) return;
      const path = sharedPlaybackPath(playback);
      if (!path) return;
      navigate(path);
      addNotification(user, "PlaySet", "Started Playback");
    };
    const onPause = (user: PerPlexed.Sync.Member) =>
      addNotification(user, "Pause", "Paused Playback");
    const onResume = (user: PerPlexed.Sync.Member) =>
      addNotification(user, "Play", "Resumed Playback");
    const onJoin = (user: PerPlexed.Sync.Member) =>
      addNotification(user, "UserAdd", "Joined the session");
    const onLeave = (user: PerPlexed.Sync.Member) =>
      addNotification(user, "UserRemove", "Left the session");

    socket.on("RES_SYNC_SET_PLAYBACK", onPlaybackSet);
    socket.on("EVNT_SYNC_PAUSE", onPause);
    socket.on("EVNT_SYNC_RESUME", onResume);
    socket.on("EVNT_USER_JOIN", onJoin);
    socket.on("EVNT_USER_LEAVE", onLeave);

    return () => {
      socket.off("RES_SYNC_SET_PLAYBACK", onPlaybackSet);
      socket.off("EVNT_SYNC_PAUSE", onPause);
      socket.off("EVNT_SYNC_RESUME", onResume);
      socket.off("EVNT_USER_JOIN", onJoin);
      socket.off("EVNT_USER_LEAVE", onLeave);
    };
  }, [addNotification, isHost, navigate, socket]);

  return null;
}
