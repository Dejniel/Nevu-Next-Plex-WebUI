import { focusManager } from "@tanstack/react-query";
import { changedMediaFields } from "@nevu/contracts";
import {
  type MediaMetadata,
  applyAvailabilityChanges,
  applyMediaDetailsChanges,
  applyMediaMetadataChanges,
  getCachedMediaItems,
  mediaChangeContext,
  mediaMetadataQueryKey,
  type MediaChange,
  type MediaScope,
  type ReconciledMediaChange,
} from "entities/media/model";
import {
  applyLibraryChanges,
  applyLibraryDirectoryChanges,
  getCachedLibraryItems,
  invalidateRandomCatalogs,
  synchronizeLibraryItem,
} from "features/library/model";
import {
  applyMediaListChanges,
  getCachedListItems,
} from "features/media-lists/model";
import { applyHomeChanges } from "features/home/model";
import { serverQueryClient } from "shared/api/queryClient";

/** Batch scoped events and obtain canonical evidence; feature/entity rules own publication.
 * At most one batch per five seconds during a scan, with a trailing reconciliation. */
export function startBrowseSynchronization(
  scope: MediaScope,
  isCurrent: () => boolean,
  client = serverQueryClient,
) {
  const abort = new AbortController();
  const pending = new Map<string, MediaChange>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;
  let lastStarted = -Infinity;
  const schedule = () => {
    if (timer || running || !pending.size || !focusManager.isFocused()) return;
    timer = setTimeout(
      () => {
        timer = undefined;
        void flush();
      },
      Math.max(750, 5000 - (Date.now() - lastStarted)),
    );
  };
  const flush = async () => {
    if (!isCurrent() || abort.signal.aborted || !focusManager.isFocused()) return;
    running = true;
    lastStarted = Date.now();
    const batch = [...pending.values()];
    pending.clear();
    try {
      const changes: ReconciledMediaChange[] = [];
      const invalidatedSections = new Set<string>();
      for (const change of batch) {
        if (!isCurrent() || abort.signal.aborted) break;
        // Capture relationships before publishing canonical data or refreshing child lists.
        const occurrences = change.kind === "item" && change.id ? [
          ...getCachedMediaItems(client, scope),
          ...getCachedLibraryItems(client, scope),
          ...getCachedListItems(client, scope),
        ] : [];
        const prior = change.kind === "item" && change.id
          ? mediaChangeContext(occurrences, change.id) : undefined;
        let verified = change;
        let update: ReconciledMediaChange["update"];
        if (change.kind === "item" && change.effect !== "membership" && change.id) {
          try {
            const metadataKey = mediaMetadataQueryKey(scope, change.id);
            const cached = client.getQueryState(metadataKey) !== undefined;
            const before = client.getQueryData<MediaMetadata>(metadataKey);
            const includeDetails = cached || Boolean(prior?.found);
            update = await synchronizeLibraryItem(change.id, abort.signal, includeDetails);
            if (before && update.metadata) verified = {
              ...change,
              id: change.id,
              effect: "metadata",
              fields: [...new Set([
                ...(change.effect === "metadata" ? change.fields : []),
                ...changedMediaFields(before, update.metadata),
              ])],
            };
          } catch (error) {
            if (abort.signal.aborted) throw error;
          }
        }
        const section = change.sectionId ?? "all";
        if (
          !update &&
          !(change.kind === "list" && change.listKind === "playlist") &&
          !invalidatedSections.has("all") &&
          !invalidatedSections.has(section)
        ) {
          await invalidateRandomCatalogs(change.sectionId, abort.signal);
          invalidatedSections.add(section);
        }
        if (!isCurrent() || abort.signal.aborted) break;
        const context = change.kind === "item" && change.id
          ? mediaChangeContext([
              ...occurrences,
              ...(update?.item ? [update.item] : []),
              ...(update?.metadata ? [update.metadata] : []),
            ], change.id)
          : undefined;
        changes.push({
          change: {
            ...verified,
            sectionId: prior?.sectionId && update?.sectionId && prior.sectionId !== update.sectionId
              ? undefined
              : update?.sectionId ?? change.sectionId ?? (update?.item === null ? prior?.sectionId : undefined),
          },
          update,
          ...(context && {
            parentIds: context.parentIds,
            parentScopeUnknown: context.parentScopeUnknown,
          }),
        });
      }
      if (isCurrent() && !abort.signal.aborted)
        await applyMediaMetadataChanges(client, changes);
      if (isCurrent() && !abort.signal.aborted)
        await Promise.all([
          applyLibraryChanges(client, changes),
          applyMediaListChanges(client, changes),
          applyAvailabilityChanges(client, changes),
          applyMediaDetailsChanges(client, changes),
          applyLibraryDirectoryChanges(client, changes),
          applyHomeChanges(client, changes),
        ]);
    } catch {
      if (isCurrent() && !abort.signal.aborted) {
        // A failed canonical read/recovery is not proof of freshness. Preserve the pending scope.
        pending.set("recovery", { ...scope, kind: "recovery" });
      }
    } finally {
      running = false;
      schedule();
    }
  };
  const unfocus = focusManager.subscribe((focused) => {
    if (focused) schedule();
  });
  return {
    enqueue(change: MediaChange) {
      if (
        !isCurrent() ||
        change.serverId !== scope.serverId ||
        change.profileKey !== scope.profileKey
      )
        return;
      const key =
        change.kind === "item" && change.id
          ? `item:${change.id}`
          : change.kind === "list"
            ? `list:${change.listKind}:${change.sectionId ?? "all"}:${change.id ?? "all"}`
            : `${change.kind}:${change.sectionId ?? "all"}`;
      const previous = pending.get(key);
      // A later processing hint cannot weaken an observed insertion/deletion.
      if (!previous || previous.kind !== "item" || previous.effect !== "membership")
        pending.set(key, change);
      if (pending.size > 256) {
        pending.clear();
        pending.set("recovery", { ...scope, kind: "recovery" });
      }
      schedule();
    },
    dispose() {
      abort.abort();
      if (timer) clearTimeout(timer);
      pending.clear();
      unfocus();
    },
  };
}
