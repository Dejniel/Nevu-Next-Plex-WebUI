import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import type { MediaScope } from "entities/media/model";
import { useServerSession } from "features/session/model";
import { useUserSettings } from "features/settings/model";
import { serverQueryClient } from "shared/api/queryClient";
import { editPlaylist, type PlaylistEdit } from "../api/playlistEditing";
import { applyMediaListChanges } from "./listSync";

export function usePlaylistEditing(id: string, scope: MediaScope) {
  const request = useRef<AbortController | null>(null);
  const isCurrent = () =>
    useUserSettings.getState().profileKey === scope.profileKey &&
    useServerSession.getState().server?.machineIdentifier === scope.serverId;
  useEffect(
    () => () => request.current?.abort(),
    [id, scope.serverId, scope.profileKey],
  );
  return useMutation(
    {
      mutationKey: ["playlist-edit", scope.serverId, scope.profileKey, id],
      mutationFn: async (edit: PlaylistEdit) => {
        if (!isCurrent())
          throw new Error(
            "The active Plex profile changed. Open this action again.",
          );
        const controller = new AbortController();
        request.current = controller;
        return editPlaylist(id, edit, controller.signal);
      },
      onSettled: async (change) => {
        if (!isCurrent()) return;
        // Refresh only this profile's playlist windows, using the same publication
        // rules as Plex events. There is no optimistic copy of playlist positions.
        // Even a failed/cancelled request may have reached Plex. Revalidate its
        // scope; report reload failures in the list, separately from the write.
        await applyMediaListChanges(serverQueryClient, [
          {
            change: change ?? {
              ...scope,
              kind: "list",
              listKind: "playlist",
              id,
            },
          },
        ]).catch(() => undefined);
      },
      retry: false,
    },
    serverQueryClient,
  );
}
