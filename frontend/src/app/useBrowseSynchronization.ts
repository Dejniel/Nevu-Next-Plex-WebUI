import { useEffect } from "react";
import { invalidateMediaLists } from "features/media-lists/model";
import { AuthStorage, connectPlexServerEvents } from "features/session/model";
import { useUserSettings } from "features/settings/model";
import { invalidateLibraryCache } from "shared/lib/libraryCache";

/** Composition translates server hints into each feature's invalidation contract. */
export function useBrowseSynchronization(sessionRevision: number) {
  const profileKey = useUserSettings((state) => state.profileKey);
  useEffect(() => {
    const token = AuthStorage.getServerToken();
    if (!token || !profileKey) return;
    let active = true;
    const disconnect = connectPlexServerEvents(token, (change) => {
      if (
        !active ||
        AuthStorage.getServerToken() !== token ||
        useUserSettings.getState().profileKey !== profileKey
      )
        return;
      if (change.kind === "server" || change.kind === "library") {
        const sectionId =
          change.kind === "library" ? change.sectionId : undefined;
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
          libraryID:
            change.kind === "collection" ? change.sectionId : undefined,
        });
      }
    });
    return () => {
      active = false;
      disconnect();
    };
  }, [profileKey, sessionRevision]);
}
