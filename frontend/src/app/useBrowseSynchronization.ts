import { useEffect } from "react";
import { invalidateMediaLists } from "features/media-lists/model";
import {
  AuthStorage,
  connectPlexServerEvents,
  mediaChangeFromServer,
  useServerSession,
} from "features/session/model";
import { publishMediaChange, subscribeToMediaChanges } from "entities/media/model";
import { startLibrarySynchronization } from "features/library/model";
import { useUserSettings } from "features/settings/model";
import { invalidateLibraryCache } from "shared/lib/libraryCache";

/** Composition translates server hints into each feature's invalidation contract. */
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
    const sync = startLibrarySynchronization({ serverId, profileKey }, isCurrent);
    const unsubscribe = subscribeToMediaChanges((change) => sync.enqueue(change));
    const disconnect = connectPlexServerEvents(token, (change) => {
      if (!isCurrent()) return;
      publishMediaChange(mediaChangeFromServer(change, { serverId, profileKey }));
      if (change.kind === "server" || change.kind === "library") {
        const sectionId = change.kind === "library" ? change.sectionId : undefined;
        invalidateLibraryCache({ profileKey, sectionId });
        // Smart playlists may span libraries; collections are section-scoped.
        invalidateMediaLists({
          profileKey,
          kind: "collection",
          libraryID: sectionId,
        });
        invalidateMediaLists({ profileKey, kind: "playlist" });
      } else {
        if (change.kind === "collection")
          invalidateLibraryCache({ profileKey, sectionId: change.sectionId });
        invalidateMediaLists({
          profileKey,
          kind: change.kind,
          id: change.id,
          libraryID: change.kind === "collection" ? change.sectionId : undefined,
        });
      }
    });
    return () => {
      active = false;
      sync.dispose();
      unsubscribe();
      disconnect();
    };
  }, [profileKey, serverId, sessionRevision]);
}
