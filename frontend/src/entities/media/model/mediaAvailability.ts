import type { MediaItemData } from "./media";

export interface MediaAvailability {
  guid: string;
  localItems: readonly Plex.Metadata[];
}

export function indexMediaAvailability(items: readonly Plex.Metadata[]) {
  const index = new Map<string, MediaAvailability>();
  for (const item of items) {
    const entry = index.get(item.guid) ?? { guid: item.guid, localItems: [] };
    if (!entry.localItems.some((copy) => copy.ratingKey === item.ratingKey))
      index.set(item.guid, {
        ...entry,
        localItems: [...entry.localItems, item],
      });
  }
  return index;
}

export function selectLocalMedia(
  item: MediaItemData,
  availability: ReadonlyMap<string, MediaAvailability>,
  sectionId?: string,
) {
  const copies = item.guid ? availability.get(item.guid)?.localItems ?? [] : [];
  return (
    copies.find((copy) => String(copy.librarySectionID) === sectionId) ??
    copies[0] ??
    null
  );
}

export function isMediaInLibrary(
  guid: string,
  availability: ReadonlyMap<string, MediaAvailability>,
  sectionId: string,
) {
  return (
    availability
      .get(guid)
      ?.localItems.some(
        (copy) => String(copy.librarySectionID) === sectionId,
      ) ?? false
  );
}
