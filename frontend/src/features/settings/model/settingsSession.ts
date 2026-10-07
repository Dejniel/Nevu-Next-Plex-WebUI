import {
  AuthStorage,
  useAuthSession,
  useServerSession,
} from "features/session/model";

export function useSettingsSession() {
  const revision = useAuthSession((state) => state.revision);
  const status = useAuthSession((state) => state.status);
  const serverId =
    useServerSession((state) => state.server?.machineIdentifier) ?? "";
  const token = AuthStorage.getProfileAccountToken();
  return {
    revision,
    serverId,
    token,
    ready: status === "ready" && Boolean(serverId && token),
    isCurrent: () =>
      useAuthSession.getState().status === "ready" &&
      useAuthSession.getState().revision === revision &&
      useServerSession.getState().server?.machineIdentifier === serverId &&
      AuthStorage.getProfileAccountToken() === token,
  };
}
