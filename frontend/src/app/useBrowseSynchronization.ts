import { useEffect } from "react";
import {
  AuthStorage,
  connectPlexServerEvents,
  mediaChangeFromServer,
  useServerSession,
} from "features/session/model";
import { publishMediaChange, subscribeToMediaChanges } from "entities/media/model";
import { useUserSettings } from "features/settings/model";
import { startBrowseSynchronization } from "./browseSynchronization";

export function useBrowseSynchronization(sessionRevision: number) {
  const profileKey = useUserSettings((state) => state.profileKey);
  const serverId = useServerSession((state) => state.server?.machineIdentifier);
  useEffect(() => {
    const token = AuthStorage.getServerToken();
    if (!token || !profileKey || !serverId) return;
    let active = true;
    const isCurrent = () =>
      active &&
      AuthStorage.getServerToken() === token &&
      useUserSettings.getState().profileKey === profileKey &&
      useServerSession.getState().server?.machineIdentifier === serverId;
    const scope = { serverId, profileKey };
    const sync = startBrowseSynchronization(scope, isCurrent);
    const unsubscribe = subscribeToMediaChanges((change) => sync.enqueue(change));
    const disconnect = connectPlexServerEvents(token, (change) => {
      if (isCurrent()) publishMediaChange(mediaChangeFromServer(change, scope));
    });
    return () => {
      active = false;
      sync.dispose();
      unsubscribe();
      disconnect();
    };
  }, [profileKey, serverId, sessionRevision]);
}
