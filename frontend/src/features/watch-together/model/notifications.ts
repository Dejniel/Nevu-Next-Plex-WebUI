import { create } from "zustand";

export type WatchTogetherNotificationIcon =
  | "Play"
  | "Pause"
  | "UserAdd"
  | "UserRemove"
  | "PlaySet";

export interface WatchTogetherNotification {
  id: number;
  duration: number;
  message: string;
  user: PerPlexed.Sync.Member;
  icon: WatchTogetherNotificationIcon;
}

interface WatchTogetherNotificationState {
  notifications: WatchTogetherNotification[];
  add: (
    user: PerPlexed.Sync.Member,
    icon: WatchTogetherNotificationIcon,
    message: string,
    duration?: number,
  ) => void;
  remove: (id: number) => void;
}

let nextNotificationId = 1;

export const useWatchTogetherNotifications =
  create<WatchTogetherNotificationState>((set) => ({
    notifications: [],
    add: (user, icon, message, duration = 5000) => {
      const notification = {
        id: nextNotificationId++,
        user,
        icon,
        message,
        duration,
      };
      set((state) => ({
        notifications: [...state.notifications, notification],
      }));
    },
    remove: (id) =>
      set((state) => ({
        notifications: state.notifications.filter(
          (notification) => notification.id !== id,
        ),
      })),
  }));
