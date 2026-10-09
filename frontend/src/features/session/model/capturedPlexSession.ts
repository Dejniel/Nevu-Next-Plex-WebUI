import { AuthStorage } from "./authStorage";
import { getActiveServerScope } from "./activeServerScope";
import { useAuthSession } from "./authSession";

/** A write retains its original server/profile/token, including while queued. */
export function capturePlexSession() {
  const scope = getActiveServerScope();
  const token = AuthStorage.getServerToken();
  const revision = useAuthSession.getState().revision;
  const isCurrent = () => {
    const current = getActiveServerScope();
    const auth = useAuthSession.getState();
    return Boolean(
      token &&
        scope &&
        auth.status === "ready" &&
        auth.revision === revision &&
        AuthStorage.getServerToken() === token &&
        current?.serverId === scope.serverId &&
        current?.profileKey === scope.profileKey,
    );
  };
  return {
    scope,
    token,
    revision,
    isCurrent,
    assertCurrent(signal?: AbortSignal) {
      signal?.throwIfAborted();
      if (!isCurrent())
        throw new Error(
          "The active Plex session changed. Open this dialog again.",
        );
    },
  };
}
export type CapturedPlexSession = ReturnType<typeof capturePlexSession>;
