import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useCanManageServer } from "features/session/public";
import {
  browseLibraryFolders,
  createLibrary,
  deleteLibrary,
  getManagedLibraries,
  getManagedLibrary,
  notifyLibrariesChanged,
  runLibraryAction,
  updateLibrary,
} from "entities/library/model";
import type {
  LibraryAction,
  LibraryInput,
  LibraryUpdateInput,
} from "entities/library/model";
import { serverQueryClient } from "shared/api/queryClient";
import { useSettingsSession } from "./settingsSession";

function useLibrarySession() {
  const session = useSettingsSession();
  const canManage = useCanManageServer();
  return {
    ...session,
    canManage,
    queryKey: [
      "plex-library-administration",
      session.serverId,
      session.revision,
    ] as const,
  };
}

export function useManagedLibraries() {
  const session = useLibrarySession();
  return useQuery(
    {
      queryKey: [...session.queryKey, "libraries"],
      enabled: session.ready && session.canManage,
      queryFn: ({ signal }) =>
        getManagedLibraries({ signal, token: session.token! }),
    },
    serverQueryClient,
  );
}

export function useManagedLibrary(id: string | null) {
  const session = useLibrarySession();
  return useQuery(
    {
      queryKey: [...session.queryKey, "library", id],
      enabled: Boolean(id) && session.ready && session.canManage,
      queryFn: ({ signal }) =>
        getManagedLibrary(id!, { signal, token: session.token! }),
    },
    serverQueryClient,
  );
}

export function useLibraryFolders(key: string) {
  const session = useLibrarySession();
  return useQuery(
    {
      queryKey: [...session.queryKey, "folders", key],
      enabled: session.ready && session.canManage,
      queryFn: ({ signal }) =>
        browseLibraryFolders(key, { signal, token: session.token! }),
    },
    serverQueryClient,
  );
}

type LibraryChange =
  | { type: "create"; input: LibraryInput }
  | { type: "update"; id: string; input: LibraryUpdateInput }
  | { type: "remove"; id: string; title: string }
  | { type: "action"; id: string; action: LibraryAction };

export function useLibraryChange() {
  const session = useLibrarySession();
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
      session.canManage,
    ],
  );
  return useMutation(
    {
      mutationKey: [...session.queryKey, "change"],
      mutationFn: async (change: LibraryChange) => {
        if (!session.ready || !session.canManage || !session.isCurrent())
          throw new Error(
            "The active Plex session changed. Open this action again.",
          );
        if (request.current)
          throw new Error("A library change is already pending.");
        const operation = new AbortController();
        request.current = operation;
        const options = { token: session.token!, signal: operation.signal };
        try {
          if (change.type === "create")
            await createLibrary(change.input, options);
          else if (change.type === "update")
            await updateLibrary(change.id, change.input, options);
          else if (change.type === "remove")
            await deleteLibrary(change.id, change.title, options);
          else await runLibraryAction(change.id, change.action, options);
        } finally {
          try {
            if (session.isCurrent()) {
              if (change.type !== "action") notifyLibrariesChanged();
              await Promise.all([
                serverQueryClient.invalidateQueries({
                  queryKey: [...session.queryKey, "libraries"],
                  exact: true,
                }),
                change.type === "create"
                  ? undefined
                  : serverQueryClient.invalidateQueries({
                      queryKey: [...session.queryKey, "library", change.id],
                      exact: true,
                    }),
              ]);
            }
          } finally {
            if (request.current === operation) request.current = null;
          }
        }
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
