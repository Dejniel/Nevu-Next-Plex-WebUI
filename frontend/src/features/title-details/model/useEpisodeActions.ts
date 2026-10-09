import { useMutation } from "@tanstack/react-query";
import { setMediaPlayedStatus } from "entities/media/model";
import { getActiveServerScope, useAuthSession } from "features/session/model";
import { useEffect, useRef, useState } from "react";
import { serverQueryClient } from "shared/api/queryClient";
import { createRequestLimiter } from "shared/lib/requestLimiter";
import { useItemSelection } from "shared/lib/useItemSelection";
import type { TitleEpisodesModel } from "./useTitleEpisodes";

interface WatchedAction {
  ids: string[];
  watched: boolean;
  title?: string;
  batch: boolean;
}

class EpisodeActionError extends Error {
  constructor(readonly failedIds: string[]) {
    super(
      `Could not update ${failedIds.length} episode${failedIds.length === 1 ? "" : "s"}. You can retry the remaining items.`,
    );
  }
}

/** Single and batch actions share one confirmation/mutation owner. Successful
 * writes publish through the existing Plex synchronization, never a row mirror. */
export function useEpisodeActions(browser: TitleEpisodesModel) {
  const selection = useItemSelection(browser.identity);
  const [confirmation, setConfirmation] = useState<WatchedAction | null>(null);
  const lifetime = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    return () => controller.abort();
  }, [browser.identity]);
  const isCurrent = (controller: AbortController) => {
    const scope = getActiveServerScope();
    return (
      !controller.signal.aborted &&
      scope?.serverId === browser.scope.serverId &&
      scope?.profileKey === browser.scope.profileKey &&
      useAuthSession.getState().revision === browser.revision &&
      useAuthSession.getState().status === "ready"
    );
  };
  const mutation = useMutation(
    {
      mutationFn: async (action: WatchedAction) => {
        const controller = lifetime.current;
        if (!controller || !isCurrent(controller))
          throw new Error(
            "The active Plex session changed. Open this title again.",
          );
        const run = createRequestLimiter(4);
        const results = await Promise.allSettled(
          action.ids.map((id) =>
            run(controller.signal, 0, async () => {
              if (!isCurrent(controller))
                throw new Error("The active Plex session changed.");
              await setMediaPlayedStatus(action.watched, id, controller.signal);
            }),
          ),
        );
        if (!isCurrent(controller))
          throw new Error(
            "The active Plex session changed. Open this title again.",
          );
        const failed = action.ids.filter(
          (_, index) => results[index].status === "rejected",
        );
        if (failed.length) throw new EpisodeActionError(failed);
      },
      onSuccess: (_, action) => {
        if (lifetime.current?.signal.aborted) return;
        setConfirmation(null);
        if (action.batch) selection.clear();
      },
      onError: (error, action) => {
        if (
          lifetime.current?.signal.aborted ||
          !(error instanceof EpisodeActionError)
        )
          return;
        setConfirmation({ ...action, ids: error.failedIds });
        if (action.batch) selection.retain(error.failedIds);
      },
    },
    serverQueryClient,
  );
  const selectedIds = browser.episodes
    .filter((episode) => selection.ids.has(episode.ratingKey))
    .map((episode) => episode.ratingKey);
  const request = (watched: boolean, episode?: Plex.Metadata) => {
    const ids = episode ? [episode.ratingKey] : selectedIds;
    if (!ids.length || mutation.isPending) return;
    mutation.reset();
    setConfirmation({ ids, watched, title: episode?.title, batch: !episode });
  };
  const label = confirmation?.watched ? "watched" : "unwatched";
  return {
    selection,
    selectedCount: selectedIds.length,
    allSelected:
      browser.episodes.length > 0 &&
      selectedIds.length === browser.episodes.length,
    request,
    confirmation: confirmation && {
      title: `Mark as ${label}`,
      message: `Are you sure you want to mark ${confirmation.batch ? `${confirmation.ids.length} episode${confirmation.ids.length === 1 ? "" : "s"}` : `"${confirmation.title}"`} as ${label}?`,
      error: mutation.error?.message ?? null,
      busy: mutation.isPending,
      confirm: () => mutation.mutate(confirmation),
      cancel: () => {
        if (!mutation.isPending) setConfirmation(null);
      },
    },
    busy: mutation.isPending,
  };
}
