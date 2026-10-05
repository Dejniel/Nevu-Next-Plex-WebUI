import {
  getMediaMetadata,
  subscribeToMediaChanges,
  type MediaItemData,
} from "entities/media/model";
import { getActiveServerScope } from "features/session/model";
import { useCallback, useEffect, useMemo, useState } from "react";

type MetadataStatus = "idle" | "loading" | "loaded" | "failed";

interface MetadataResource {
  item: MediaItemData;
  data: Plex.Metadata | null;
  status: MetadataStatus;
  generation: number;
  pending: Promise<Plex.Metadata> | null;
  active: boolean;
}

export class StaleMediaMetadataRequestError extends Error {
  constructor() {
    super("The selected media item or its metadata changed.");
    this.name = "StaleMediaMetadataRequestError";
  }
}

export function useLazyMediaMetadata(item: MediaItemData) {
  // A refreshed item also starts a new cache, even if its Plex ID is unchanged.
  const resource = useMemo<MetadataResource>(
    () => ({
      item,
      data: null,
      status: "idle",
      generation: 0,
      pending: null,
      active: true,
    }),
    [item],
  );
  const [snapshot, setSnapshot] = useState({
    resource,
    data: resource.data,
    status: resource.status,
  });

  useEffect(() => {
    resource.active = true;
    return () => {
      resource.active = false;
      resource.generation += 1;
      resource.pending = null;
      resource.data = null;
      resource.status = "idle";
    };
  }, [resource]);

  const publish = useCallback(() => {
    setSnapshot({ resource, data: resource.data, status: resource.status });
  }, [resource]);

  const invalidate = useCallback(() => {
    if (!resource.active) throw new StaleMediaMetadataRequestError();
    resource.generation += 1;
    resource.pending = null;
    resource.data = null;
    resource.status = "idle";
    publish();
  }, [publish, resource]);

  const update = useCallback(
    (data: Plex.Metadata) => {
      invalidate();
      resource.data = data;
      resource.status = "loaded";
      publish();
    },
    [invalidate, publish, resource],
  );

  useEffect(() => {
    const scope = getActiveServerScope();
    return subscribeToMediaChanges((change) => {
      if (scope?.serverId !== change.serverId || scope?.profileKey !== change.profileKey) return;
      if (change.kind === "recovery" || (change.kind === "item" && change.id === item.ratingKey)) {
        if (resource.active) invalidate();
      }
    });
  }, [invalidate, item.ratingKey, resource]);

  const load = useCallback((): Promise<Plex.Metadata> => {
    if (!resource.active) return Promise.reject(new StaleMediaMetadataRequestError());
    if (resource.data) return Promise.resolve(resource.data);
    if (resource.pending) return resource.pending;

    const generation = ++resource.generation;
    const isCurrent = () => resource.active && generation === resource.generation;
    resource.status = "loading";
    publish();

    const pending = getMediaMetadata(resource.item.ratingKey)
      .then((data) => {
        if (!isCurrent()) throw new StaleMediaMetadataRequestError();
        resource.data = data;
        resource.status = "loaded";
        publish();
        return data;
      })
      .catch((error: unknown) => {
        if (!isCurrent()) throw new StaleMediaMetadataRequestError();
        resource.status = "failed";
        publish();
        throw error;
      })
      .finally(() => {
        if (resource.pending === pending) resource.pending = null;
      });
    // Share the guarded promise so every caller rejects a stale response.
    resource.pending = pending;
    return pending;
  }, [publish, resource]);

  return {
    data: snapshot.resource === resource ? snapshot.data : null,
    status: snapshot.resource === resource ? snapshot.status : ("idle" as const),
    load,
    invalidate,
    update,
  };
}
