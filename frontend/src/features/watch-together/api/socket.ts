import { io, Socket } from "socket.io-client";
import { AuthStorage } from "features/session/model";
import { getBackendURL, isDev } from "shared/api/backend";

export function createWatchTogetherSocket(room?: string): Socket {
  const options = {
    auth: {
      token: AuthStorage.getProfileAccountToken(),
    },
    query: {
      room: room || "new",
    },
    autoConnect: false,
  };

  return isDev ? io(getBackendURL(), options) : io(options);
}
