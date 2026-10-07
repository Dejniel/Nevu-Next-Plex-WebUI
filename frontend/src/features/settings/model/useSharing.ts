import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import {
  AuthStorage,
  useAuthSession,
  useServerSession,
} from "features/session/model";
import { serverQueryClient } from "shared/api/queryClient";
import {
  createShare,
  deleteShare,
  getSharingOverview,
  updateShare,
} from "../api/sharing";
import type { NewShareInput, ShareInput } from "../api/sharing";

type SharingChange =
  | { type: "create"; input: NewShareInput }
  | { type: "update"; id: number; input: ShareInput }
  | { type: "remove"; id: number };

function useSharingSession() {
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
    queryKey: ["plex-sharing", serverId, revision] as const,
    isCurrent: () =>
      useAuthSession.getState().status === "ready" &&
      useAuthSession.getState().revision === revision &&
      useServerSession.getState().server?.machineIdentifier === serverId &&
      AuthStorage.getProfileAccountToken() === token,
  };
}

export function useSharingOverview(enabled: boolean) {
  const session = useSharingSession();
  return useQuery(
    {
      queryKey: session.queryKey,
      enabled: enabled && session.ready,
      queryFn: ({ signal }) => getSharingOverview(signal),
    },
    serverQueryClient,
  );
}

export function useSharingChange() {
  const session = useSharingSession();
  const request = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      request.current?.abort();
      request.current = null;
    },
    [session.revision, session.serverId, session.token, session.ready],
  );
  return useMutation(
    {
      mutationKey: [...session.queryKey, "change"],
      mutationFn: async (change: SharingChange) => {
        if (!session.ready || !session.isCurrent())
          throw new Error(
            "The active Plex session changed. Open this action again.",
          );
        if (request.current)
          throw new Error("A sharing change is already pending.");
        const operation = new AbortController();
        request.current = operation;
        try {
          if (change.type === "remove")
            await deleteShare(change.id, operation.signal);
          else if (change.type === "update")
            await updateShare(change.id, change.input, operation.signal);
          else await createShare(change.input, operation.signal);
        } finally {
          try {
            // Even an uncertain write may reach Plex. Both settings screens observe this resource.
            if (session.isCurrent())
              await serverQueryClient.invalidateQueries({
                queryKey: session.queryKey,
                exact: true,
              });
          } finally {
            if (request.current === operation) request.current = null;
          }
        }
        // A profile can change while the authoritative read is still pending.
        operation.signal.throwIfAborted();
        if (!session.isCurrent())
          throw new Error(
            "The active Plex session changed. Open this action again.",
          );
      },
      retry: false,
    },
    serverQueryClient,
  );
}
