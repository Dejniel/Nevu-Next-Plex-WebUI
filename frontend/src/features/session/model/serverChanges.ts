import type { MediaChange, MediaScope } from "entities/media/model";

interface TimelineDetails {
  id?: string;
  sectionId?: string;
  identifier?: "com.plexapp.plugins.library";
  type?: number;
  state?: number;
  updatedAt?: number;
  metadataState?: string;
  mediaState?: string;
}

export type PlexServerChange =
  | (TimelineDetails & { kind: "library" | "collection" | "playlist" })
  | { kind: "server"; reason: "preference" | "provider.change" | "reconnect" };

const identifier = (value: unknown) =>
  typeof value === "string" && /^\d+$/.test(value)
    ? value
    : typeof value === "number" && Number.isSafeInteger(value) && value >= 0
      ? String(value)
      : undefined;

const integer = (value: unknown) => {
  const id = identifier(value);
  const number = id === undefined ? NaN : Number(id);
  return Number.isSafeInteger(number) ? number : undefined;
};
const processingState = (value: unknown) =>
  typeof value === "string" && /^[a-zA-Z][a-zA-Z0-9_-]{0,31}$/.test(value) ? value : undefined;

/** Notifications are invalidation hints; their partial metadata is never cached. */
export function parsePlexServerChanges(event: string, data: string): PlexServerChange[] {
  if (event === "preference" || event === "provider.change")
    return [{ kind: "server", reason: event }];
  if (event !== "timeline") return [];
  try {
    const payload = JSON.parse(data);
    const entries = payload?.TimelineEntry ?? payload?.NotificationContainer?.TimelineEntry;
    return (Array.isArray(entries) ? entries : entries ? [entries] : []).flatMap<PlexServerChange>((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
      if (entry.identifier && entry.identifier !== "com.plexapp.plugins.library") return [];
      const type = integer(entry.type);
      const sectionId = identifier(entry.sectionID);
      const id = identifier(entry.itemID);
      const state = integer(entry.state);
      const updatedAt = integer(entry.updatedAt);
      const metadataState = processingState(entry.metadataState);
      const mediaState = processingState(entry.mediaState);
      const details: TimelineDetails = {
        ...(id !== undefined && { id }),
        ...(sectionId !== undefined && { sectionId }),
        ...(entry.identifier === "com.plexapp.plugins.library" && { identifier: entry.identifier }),
        ...(type !== undefined && { type }),
        ...(state !== undefined && { state }),
        ...(updatedAt !== undefined && { updatedAt }),
        ...(metadataState !== undefined && { metadataState }),
        ...(mediaState !== undefined && { mediaState }),
      };
      if (type === 15) return [{ ...details, kind: "playlist" }];
      if (type === 18) return [{ ...details, kind: "collection" }];
      if (sectionId || id || (type !== undefined && type >= 1 && type <= 14))
        return [{ ...details, kind: "library" }];
      return [];
    });
  } catch {
    return [];
  }
}

export function mediaChangeFromServer(change: PlexServerChange, scope: MediaScope): MediaChange {
  if (change.kind === "server") return { ...scope, kind: "recovery" };
  const common = {
    ...scope,
    ...(change.sectionId && { sectionId: change.sectionId }),
    ...(change.id && { id: change.id }),
  };
  if (change.kind !== "library") return { ...common, kind: "list", listKind: change.kind };
  // Creation/deletion affect positions; processing states never prove stable membership.
  const membership =
    change.identifier === "com.plexapp.plugins.library" &&
    (change.state === 0 || change.state === 9);
  return { ...common, kind: "item", effect: membership ? "membership" : "unknown" };
}
