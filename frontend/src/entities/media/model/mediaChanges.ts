import type { LibraryItemUpdateDto } from "@nevu/contracts";

export interface MediaScope {
  serverId: string;
  profileKey: string;
}

/** Metadata fields are verified before/after Plex differences, including side
 * effects. Incomplete comparisons or requested PUT fields remain unknown. */
export type MediaChange = MediaScope & { sectionId?: string } & (
    | {
        kind: "item";
        effect: "metadata";
        id: string;
        fields: readonly string[];
        parentIds?: readonly string[];
      }
    | { kind: "item"; effect: "membership" | "unknown"; id?: string }
    | { kind: "list"; listKind: "collection" | "playlist"; id?: string }
    | { kind: "recovery" }
  );

export type SynchronizationDecision = "ignore" | "patch" | "refresh";

export interface ReconciledMediaChange {
  change: MediaChange;
  update?: LibraryItemUpdateDto;
  /** Prior and current relationships; retained even when the canonical read returns 404. */
  parentIds?: readonly string[];
  parentScopeUnknown?: boolean;
}

export function affectedMediaParents({ change, update, parentIds }: ReconciledMediaChange) {
  return [...new Set([
    ...(parentIds ?? []),
    ...(update?.parentIds ?? []),
    ...(change.kind === "item" && change.effect === "metadata" ? change.parentIds ?? [] : []),
  ])];
}

export function matchesMediaScope(scope: MediaScope, change: MediaScope) {
  return scope.serverId === change.serverId && scope.profileKey === change.profileKey;
}

const listeners = new Set<(change: MediaChange) => void>();
export function publishMediaChange(change: MediaChange) {
  listeners.forEach((listener) => listener(change));
}
export function subscribeToMediaChanges(listener: (change: MediaChange) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
