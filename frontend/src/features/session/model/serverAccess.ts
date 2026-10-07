import { useAuthSession } from "./authSession";
import { useServerSession } from "./serverSession";

export function canManageServer(
  isUnrestrictedProfile: boolean,
  hasServerPermission: boolean,
) {
  return isUnrestrictedProfile && hasServerPermission;
}

export function useCanManageServer() {
  const isUnrestrictedProfile = useAuthSession((state) =>
    Boolean(state.activeUser && !state.activeUser.restricted),
  );
  const hasServerPermission = useServerSession(
    (state) => state.canManageServer,
  );
  return canManageServer(isUnrestrictedProfile, hasServerPermission);
}
