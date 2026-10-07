import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import type { MediaChange, MediaScope } from "entities/media/model";
import {
  AuthStorage,
  useAuthSession,
  useServerSession,
} from "features/session/model";
import { useUserSettings } from "features/settings/model";
import { serverQueryClient } from "shared/api/queryClient";
import { editPlaylist, type PlaylistEdit } from "../api/playlistEditing";
import { applyMediaListChanges } from "./listSync";

export function usePlaylistEditing(id: string, scope: MediaScope) {
  const request = useRef<AbortController | null>(null);
  const revision = useAuthSession((state) => state.revision);
  const status = useAuthSession((state) => state.status);
  const token = AuthStorage.getServerToken();
  const isCurrent = () =>
    useAuthSession.getState().status === "ready" &&
    useAuthSession.getState().revision === revision &&
    AuthStorage.getServerToken() === token &&
    useUserSettings.getState().profileKey === scope.profileKey &&
    useServerSession.getState().server?.machineIdentifier === scope.serverId;
  useEffect(
    () => () => {
      request.current?.abort();
      request.current = null;
    },
    [id, scope.serverId, scope.profileKey, revision, status, token],
  );
  return useMutation(
    {
      mutationKey: [
        "playlist-edit",
        scope.serverId,
        scope.profileKey,
        revision,
        id,
      ],
      mutationFn: async (edit: PlaylistEdit) => {
        if (!token || !isCurrent())
          throw new Error(
            "The active Plex profile changed. Open this action again.",
          );
        if (request.current)
          throw new Error("A playlist edit is already pending.");
        const operation = new AbortController();
        request.current = operation;
        let change: MediaChange = {
          ...scope,
          kind: "list",
          listKind: "playlist",
          id,
        };
        // Refresh only this profile's playlist windows, using the same publication
        // rules as Plex events. There is no optimistic copy of playlist positions.
        // Even a failed/cancelled request may have reached Plex. Revalidate its
        // scope; report reload failures in the list, separately from the write.
        try {
          change = await editPlaylist(id, edit, operation.signal);
        } finally {
          try {
            if (isCurrent())
              await applyMediaListChanges(serverQueryClient, [
                { change },
              ]).catch(() => undefined);
          } finally {
            if (request.current === operation) request.current = null;
          }
        }
        operation.signal.throwIfAborted();
        if (!isCurrent())
          throw new Error(
            "The active Plex session changed. Open this action again.",
          );
        return change;
      },
      retry: false,
    },
    serverQueryClient,
  );
}
