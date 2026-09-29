import { useAuthSession } from "./authSession";
import { useServerSession } from "./serverSession";

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
  const hasServerPermission = useServerSession(
    (state) => state.canManageServer,
  );
  return canManageServer(isPlexHomeOwner, hasServerPermission);
}
