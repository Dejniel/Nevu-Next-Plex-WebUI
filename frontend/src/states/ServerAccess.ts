import { useAuthSession } from "./AuthSessionState";
import { useSessionStore } from "./SessionState";

export function canManageServer(
  isPlexHomeOwner: boolean,
  hasServerPermission: boolean,
) {
  return isPlexHomeOwner && hasServerPermission;
}

export function useCanManageServer() {
  const isPlexHomeOwner = useAuthSession(
    (state) => Boolean(state.activeProfile?.isOwner),
  );
  const hasServerPermission = useSessionStore(
    (state) => state.canManageServer,
  );
  return canManageServer(isPlexHomeOwner, hasServerPermission);
}
