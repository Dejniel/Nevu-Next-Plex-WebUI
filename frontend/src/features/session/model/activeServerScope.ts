import { useAuthSession } from "./authSession";
import { useServerSession } from "./serverSession";
import { plexProfileKey } from "./profileIdentity";
import { useMemo } from "react";

export function useActiveServerScope() {
  const serverId = useServerSession((state) => state.server?.machineIdentifier) ?? "";
  const profileKey =
    useAuthSession((state) => plexProfileKey(state.ownerUser, state.activeProfile)) ?? "";
  return useMemo(() => ({ serverId, profileKey }), [serverId, profileKey]);
}

export function getActiveServerScope() {
  const { ownerUser, activeProfile } = useAuthSession.getState();
  const profileKey = plexProfileKey(ownerUser, activeProfile);
  const serverId = useServerSession.getState().server?.machineIdentifier;
  return profileKey && serverId ? { profileKey, serverId } : null;
}
