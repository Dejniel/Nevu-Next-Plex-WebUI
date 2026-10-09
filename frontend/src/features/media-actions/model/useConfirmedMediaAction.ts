import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { serverQueryClient } from "shared/api/queryClient";
import { createMetadataMatcher } from "../api/matching";
import { createWatchedAction, WatchedActionError } from "../api/watched";
import {
  useMediaActionDialog,
  type ConfirmedMediaAction,
} from "./mediaActionDialog";

/** One confirmation owns pending/error/retry and its cancellable write lifetime. */
export function useConfirmedMediaAction(
  selection: ConfirmedMediaAction,
  onClose: () => void,
) {
  const [ids, setIds] = useState(() =>
    selection.kind === "watched"
      ? selection.items.map((item) => item.ratingKey)
      : [selection.data.ratingKey],
  );
  const [execute] = useState(() => {
    if (selection.kind === "unmatch") {
      const source = createMetadataMatcher(selection.data);
      return (_ids: string[], signal: AbortSignal) => source.unmatch(signal);
    }
    const apply = createWatchedAction(selection);
    return (ids: string[], signal: AbortSignal) =>
      apply(selection.watched, ids, signal);
  });
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  const mutation = useMutation(
    {
      mutationKey: [
        "media-action",
        selection.kind,
        selection.scope.serverId,
        selection.scope.profileKey,
        selection.revision,
      ],
      mutationFn: ({ ids, signal }: { ids: string[]; signal: AbortSignal }) => {
        selection.assertCurrent(signal);
        return execute(ids, signal);
      },
    },
    serverQueryClient,
  );
  const current = (controller: AbortController) =>
    !controller.signal.aborted &&
    selection.isCurrent() &&
    useMediaActionDialog.getState().selection === selection;
  const progress = (remainingIds: string[]) => {
    if (selection.kind === "watched") selection.onProgress?.(remainingIds);
  };
  return {
    ids,
    busy: mutation.isPending,
    error: mutation.error?.message ?? null,
    async confirm() {
      if (request.current || !ids.length) return;
      const controller = new AbortController();
      request.current = controller;
      try {
        await mutation.mutateAsync({ ids, signal: controller.signal });
        if (current(controller)) {
          try {
            progress([]);
          } finally {
            onClose();
          }
        }
      } catch (error) {
        if (current(controller) && error instanceof WatchedActionError) {
          setIds(error.failedIds);
          progress(error.failedIds);
        }
        // Query owns visible failures. Cancelled/stale work cannot change a new dialog.
      } finally {
        if (request.current === controller) request.current = null;
      }
    },
  };
}
