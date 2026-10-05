import { useCallback, useEffect, useSyncExternalStore } from "react";
import { useUserSettings } from "features/settings/model";
import {
  getPagedCollection,
  emptyCollection,
} from "shared/lib/PagedCollection";
import { useAutoRefresh } from "shared/lib/useAutoRefresh";
import { createMediaListSource } from "../api/mediaLists";
import { subscribeToMediaListChanges } from "./listChanges";
import type {
  MediaListQuery,
  MediaListRecord,
  MediaListSummary,
} from "./mediaLists";

const EMPTY = emptyCollection<MediaListRecord, MediaListSummary>();
const noSubscription = () => () => {};
const emptySnapshot = () => EMPTY;

/** Keep Plex positions, including repeated titles, through the shared range cache. */
export function useMediaList(query: MediaListQuery) {
  const profileKey = useUserSettings((state) => state.profileKey);
  const { kind, libraryID, id, search, sort } = query;
  const key = JSON.stringify([profileKey, kind, libraryID, id, search, sort]);
  const collection = profileKey
    ? getPagedCollection<MediaListRecord, MediaListSummary>(
        [
          "media-lists",
          profileKey,
          kind,
          libraryID ?? null,
          id ?? null,
          search ?? "",
          sort ?? "",
        ],
        {
          pageSize: 100,
          loadFirst: true,
          page: (offset, signal) =>
            createMediaListSource(
              { kind, libraryID, id, search, sort },
              signal,
            ).page(offset, 100),
          info: (signal) =>
            createMediaListSource(
              { kind, libraryID, id, search, sort },
              signal,
            ).summary(),
        },
      )
    : null;
  const snapshot = useSyncExternalStore(
    collection?.subscribe ?? noSubscription,
    collection?.snapshot ?? emptySnapshot,
  );
  useEffect(() => {
    collection?.retain();
    return () => collection?.release();
  }, [collection]);

  const automatic = useAutoRefresh(collection ? key : null, () =>
    collection?.refresh(),
  );
  useEffect(
    () =>
      subscribeToMediaListChanges((change) => {
        if (
          change.profileKey !== profileKey ||
          (change.kind && change.kind !== kind)
        )
          return;
        if (id && change.id && change.id !== id) return;
        if (
          kind === "collection" &&
          change.libraryID &&
          change.libraryID !== libraryID
        )
          return;
        automatic.current?.invalidate();
      }),
    [profileKey, kind, id, libraryID, automatic],
  );

  const requestRange = useCallback(
    ({ start, end }: { start: number; end: number }) =>
      collection?.demand(start, end),
    [collection],
  );
  const retry = useCallback(() => collection?.retry(), [collection]);
  const refresh = useCallback(() => {
    void automatic.current?.refresh();
  }, [automatic]);
  return {
    key,
    items: snapshot.items,
    summary: snapshot.info,
    total: snapshot.totalSize,
    error: snapshot.errors.values().next().value?.message ?? null,
    loading: Boolean(
      collection && !["loaded", "error"].includes(snapshot.ranges.get(0) ?? ""),
    ),
    requestRange,
    retry,
    refresh,
  };
}
