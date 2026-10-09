import {
  canManageServer,
  capturePlexSession,
  useAuthSession,
  useServerSession,
} from "features/session/model";

/** Edits and matching retain the session that opened the metadata workflow. */
export function createMetadataSession() {
  const session = capturePlexSession();
  return {
    ...session,
    assertCurrent(signal?: AbortSignal) {
      session.assertCurrent(signal);
      const auth = useAuthSession.getState();
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
