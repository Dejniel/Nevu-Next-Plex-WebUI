import { Socket } from "socket.io-client";
import { create } from "zustand";
import { createWatchTogetherSocket } from "../api/socket";

export type WatchTogetherStatus =
  | "disconnected"
  | "connecting"
  | "connected";

interface WatchTogetherSessionState {
  socket: Socket | null;
  status: WatchTogetherStatus;
  isHost: boolean;
  room: string | null;
  connect: (room?: string) => Promise<true | PerPlexed.Sync.SocketError>;
  disconnect: () => void;
}

const disconnectedState = {
  socket: null,
  status: "disconnected" as const,
  isHost: false,
  room: null,
};

export const useWatchTogetherSession = create<WatchTogetherSessionState>(
  (set, get) => ({
    ...disconnectedState,

    connect: async (room) => {
      get().disconnect();

      const socket = createWatchTogetherSocket(room);
      set({
        socket,
        status: "connecting",
        isHost: false,
        room: null,
      });

      return new Promise<true | PerPlexed.Sync.SocketError>((resolve) => {
        let settled = false;

        const finish = (result: true | PerPlexed.Sync.SocketError) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          socket.off("ready", onReady);
          socket.off("conn-error", onConnectionError);
          resolve(result);
        };

        const resetIfCurrent = () => {
          if (get().socket === socket) set(disconnectedState);
        };

        const onReady = (data: PerPlexed.Sync.Ready) => {
          if (get().socket !== socket) return;
          set({ status: "connected", isHost: data.host, room: data.room });
          finish(true);
        };

        const onConnectionError = (error: PerPlexed.Sync.SocketError) => {
          resetIfCurrent();
          finish(error);
          socket.disconnect();
        };

        const onDisconnect = () => {
          resetIfCurrent();
          finish({
            type: "disconnected",
            message: "Disconnected before the session was ready",
          });
        };

        const timeout = setTimeout(() => {
          resetIfCurrent();
          finish({
            type: "timeout",
            message: "Connection timed out",
          });
          socket.disconnect();
        }, 5000);

        socket.once("ready", onReady);
        socket.once("conn-error", onConnectionError);
        socket.on("disconnect", onDisconnect);
        socket.connect();
      });
    },

    disconnect: () => {
      get().socket?.disconnect();
      set(disconnectedState);
    },
  }),
);
