import {
  AuthStorage,
  canManageServer,
  getActiveServerScope,
  useAuthSession,
  useServerSession,
} from "features/session/model";

/** Edits and matching retain the session that opened the metadata workflow. */
export function createMetadataSession() {
  const scope = getActiveServerScope();
  const token = AuthStorage.getServerToken();
  const revision = useAuthSession.getState().revision;
  return {
    scope,
    token,
    revision,
    assertCurrent(signal?: AbortSignal) {
      signal?.throwIfAborted();
      const current = getActiveServerScope();
      const auth = useAuthSession.getState();
      if (
        !token ||
        !scope ||
        auth.status !== "ready" ||
        auth.revision !== revision ||
        AuthStorage.getServerToken() !== token ||
        current?.serverId !== scope.serverId ||
        current?.profileKey !== scope.profileKey
      )
        throw new Error(
          "The active Plex session changed. Open this dialog again.",
        );
      if (
        !canManageServer(
          Boolean(auth.activeUser && !auth.activeUser.restricted),
          useServerSession.getState().canManageServer,
        )
      )
        throw new Error(
          "This action requires Plex server administrator access.",
        );
    },
  };
}
