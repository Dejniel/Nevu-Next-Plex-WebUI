export type PlexServerChange =
  | { kind: "library"; sectionId?: string }
  | { kind: "collection"; sectionId?: string; id?: string }
  | { kind: "playlist"; id?: string }
  | { kind: "server" };

const identifier = (value: unknown) =>
  typeof value === "string" && /^\d+$/.test(value)
    ? value
    : typeof value === "number" && Number.isSafeInteger(value) && value >= 0
      ? String(value)
      : undefined;

/** Notifications are invalidation hints; their partial metadata is never cached. */
export function parsePlexServerChanges(
  event: string,
  data: string,
): PlexServerChange[] {
  if (event === "preference" || event === "provider.change")
    return [{ kind: "server" }];
  if (event !== "timeline") return [];
  try {
    const payload = JSON.parse(data);
    const entries =
      payload?.TimelineEntry ?? payload?.NotificationContainer?.TimelineEntry;
    return (
      Array.isArray(entries) ? entries : entries ? [entries] : []
    ).flatMap((entry) => {
      if (
        entry.identifier &&
        entry.identifier !== "com.plexapp.plugins.library"
      )
        return [];
      const type = Number(entry.type);
      const sectionId = identifier(entry.sectionID);
      const id = identifier(entry.itemID);
      if (type === 15) return [{ kind: "playlist", id } as PlexServerChange];
      if (type === 18)
        return [{ kind: "collection", sectionId, id } as PlexServerChange];
      if (sectionId || (type >= 1 && type <= 14))
        return [{ kind: "library", sectionId } as PlexServerChange];
      return [];
    });
  } catch {
    return [];
  }
}
