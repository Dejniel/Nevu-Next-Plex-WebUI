import {
  PauseRounded,
  PersonAddRounded,
  PersonRemoveRounded,
  PlayArrowRounded,
  ResetTvRounded,
} from "@mui/icons-material";
import { Avatar, Box, Divider, SvgIconProps, Typography } from "@mui/material";
import { ComponentType, useEffect, useState } from "react";
import {
  useWatchTogetherNotifications,
  WatchTogetherNotification,
  WatchTogetherNotificationIcon,
} from "../model/notifications";

const notificationIcons: Record<
  WatchTogetherNotificationIcon,
  ComponentType<SvgIconProps>
> = {
  Play: PlayArrowRounded,
  Pause: PauseRounded,
  UserAdd: PersonAddRounded,
  UserRemove: PersonRemoveRounded,
  PlaySet: ResetTvRounded,
};

function NotificationCard({
  id,
  user,
  icon,
  message,
  duration,
}: WatchTogetherNotification) {
  const [visible, setVisible] = useState(false);
  const remove = useWatchTogetherNotifications((state) => state.remove);
  const Icon = notificationIcons[icon];

  useEffect(() => {
    const enterTimer = setTimeout(() => setVisible(true), 20);
    const exitTimer = setTimeout(() => setVisible(false), duration);
    const removeTimer = setTimeout(() => remove(id), duration + 500);

    return () => {
      clearTimeout(enterTimer);
      clearTimeout(exitTimer);
      clearTimeout(removeTimer);
    };
  }, [duration, id, remove]);

  return (
    <Box
      sx={{
        width: 300,
        minHeight: 75,
        bgcolor: "#121212",
        display: "flex",
        alignItems: "center",
        px: 2,
        transition: "transform 0.5s ease-in-out",
        transform: visible ? "translateX(0)" : "translateX(300px)",
      }}
    >
      <Icon sx={{ color: "white", fontSize: "2rem" }} />
      <Divider orientation="vertical" variant="middle" flexItem sx={{ mx: 2 }} />
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography color="white" noWrap sx={{ fontWeight: "bold" }}>
          {user.name}
        </Typography>
        <Typography color="white" variant="body2">
          {message}
        </Typography>
      </Box>
      <Avatar src={user.avatar} sx={{ ml: 2, width: 45, height: 45 }} />
    </Box>
  );
}

export default function WatchTogetherNotifications() {
  const notifications = useWatchTogetherNotifications(
    (state) => state.notifications,
  );

  return (
    <Box
      sx={{
        position: "fixed",
        top: 64,
        right: 0,
        zIndex: 30000,
        overflow: "hidden",
        pointerEvents: "none",
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
      }}
    >
      {notifications.map((notification) => (
        <NotificationCard key={notification.id} {...notification} />
      ))}
    </Box>
  );
}
