import { useAuthSession } from "./authSession";
import { useServerSession } from "./serverSession";
import { plexProfileKey } from "./profileIdentity";

export function getActiveServerScope() {
  const { ownerUser, activeProfile } = useAuthSession.getState();
  const profileKey = plexProfileKey(ownerUser, activeProfile);
  const serverId = useServerSession.getState().server?.machineIdentifier;
  return profileKey && serverId ? { profileKey, serverId } : null;
}
