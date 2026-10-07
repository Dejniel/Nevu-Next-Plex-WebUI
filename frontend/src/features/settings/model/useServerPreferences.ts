import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import type { PlexPreference, PreferenceChanges } from "@nevu/contracts";
import { serverQueryClient } from "shared/api/queryClient";
import { useCanManageServer } from "features/session/public";
import { useServerSession } from "features/session/model";
import {
  getServerPreferences,
  updateServerPreferences,
} from "../api/serverPreferences";
import { useSettingsSession } from "./settingsSession";

export function useServerPreferences() {
  const session = useSettingsSession();
  const canManage = useCanManageServer();
  const queryKey = [
    "plex-server-preferences",
    session.serverId,
    session.revision,
  ] as const;
  const query = useQuery(
    {
      queryKey,
      enabled: canManage && session.ready,
      queryFn: ({ signal }) => getServerPreferences(session.token!, signal),
    },
    serverQueryClient,
  );
  const request = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      request.current?.abort();
      request.current = null;
    },
    [
      session.revision,
      session.serverId,
      session.token,
      session.ready,
      canManage,
    ],
  );
  const save = useMutation(
    {
      mutationKey: [...queryKey, "save"],
      mutationFn: async (preferences: PreferenceChanges) => {
        if (!canManage || !session.ready || !session.isCurrent())
          throw new Error(
            "The active Plex session changed. Open settings again.",
          );
        if (request.current)
          throw new Error("A preferences save is already pending.");
        const operation = new AbortController();
        request.current = operation;
        try {
          const changes = await updateServerPreferences(
            session.token!,
            preferences,
            operation.signal,
          );
          operation.signal.throwIfAborted();
          if (session.isCurrent())
            serverQueryClient.setQueryData<PlexPreference[]>(
              queryKey,
              (current) =>
                current?.map((setting) =>
                  Object.hasOwn(changes, setting.id)
                    ? { ...setting, value: changes[setting.id] }
                    : setting,
                ),
            );
        } finally {
          try {
            if (session.isCurrent())
              await serverQueryClient.invalidateQueries({
                queryKey,
                exact: true,
              });
          } finally {
            if (request.current === operation) request.current = null;
          }
        }
        operation.signal.throwIfAborted();
        if (!session.isCurrent())
          throw new Error(
            "The active Plex session changed. Open settings again.",
          );
        // Server identity can change alongside preferences such as FriendlyName.
        void useServerSession.getState().refresh();
      },
      retry: false,
      gcTime: 0,
    },
    serverQueryClient,
  );
  return { query, save };
}
