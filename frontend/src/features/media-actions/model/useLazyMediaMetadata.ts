import { isCancelledError, useQuery } from "@tanstack/react-query";
import {
  type MediaMetadata,
  mediaMetadataQueryOptions,
  type MediaItemData,
} from "entities/media/model";
import { useActiveServerScope, useAuthSession } from "features/session/model";
import { useEffect, useMemo } from "react";
import { serverQueryClient } from "shared/api/queryClient";

export class StaleMediaMetadataRequestError extends Error {
  constructor() {
    super("The selected media item or its metadata changed.");
    this.name = "StaleMediaMetadataRequestError";
  }
}

export function useLazyMediaMetadata(item: MediaItemData) {
  const scope = useActiveServerScope();
  const revision = useAuthSession((state) => state.revision);
  const options = useMemo(
    () => mediaMetadataQueryOptions(scope, item.ratingKey),
    [scope, item.ratingKey],
  );
  const result = useQuery({ ...options, enabled: false }, serverQueryClient);
  // This guard belongs to the action's mounted item, not the shared query lifetime.
  const action = useMemo(
    () => ({ options, revision, active: true }),
    [options, revision],
  );
  useEffect(() => {
    action.active = true;
    return () => {
      action.active = false;
    };
  }, [action]);
  const assertCurrent = () => {
    if (!action.active || useAuthSession.getState().revision !== revision)
      throw new StaleMediaMetadataRequestError();
  };
  return {
    data: result.data ?? null,
    status: result.isFetching
      ? "loading"
      : result.isError
        ? "failed"
        : result.data
          ? "loaded"
          : "idle",
    load: async () => {
      assertCurrent();
      try {
        const data = await serverQueryClient.fetchQuery(options);
        assertCurrent();
        if (serverQueryClient.getQueryState(options.queryKey)?.isInvalidated)
          throw new StaleMediaMetadataRequestError();
        return data;
      } catch (error) {
        if (!action.active || isCancelledError(error))
          throw new StaleMediaMetadataRequestError();
        throw error;
      }
    },
    update: (data: MediaMetadata) => {
      assertCurrent();
      void serverQueryClient.cancelQueries({
        queryKey: options.queryKey,
        exact: true,
      });
      serverQueryClient.setQueryData(options.queryKey, data);
    },
  };
}
