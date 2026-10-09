import type { MediaMetadata } from "plex/media";
import type { MediaItemData } from "./media";
import { getPlexTitleIdentity } from "./mediaIdentity";

export type LocalMediaMatch = MediaMetadata & {
  type: "movie" | "show";
  guid: string;
  librarySectionID: number;
};

export function isLocalMediaMatch(
  item: MediaMetadata,
): item is LocalMediaMatch {
  const identity = getPlexTitleIdentity(item.guid);
  return Boolean(
    identity &&
      identity.type === item.type &&
      /^\d+$/.test(item.ratingKey) &&
      Number(item.ratingKey) > 0 &&
      Number.isSafeInteger(Number(item.ratingKey)) &&
      Number.isSafeInteger(item.librarySectionID) &&
      (item.librarySectionID ?? 0) > 0,
  );
}

export interface MediaAvailability {
  guid: string;
  localItems: readonly LocalMediaMatch[];
}

export function indexMediaAvailability(items: readonly LocalMediaMatch[]) {
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
  item: Pick<MediaItemData, "guid">,
  availability: ReadonlyMap<string, MediaAvailability>,
  sectionId?: string,
) {
  const copies = item.guid
    ? (availability.get(item.guid)?.localItems ?? [])
    : [];
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
