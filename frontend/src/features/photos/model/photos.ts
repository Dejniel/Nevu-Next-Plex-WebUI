import type { MediaItemData } from "entities/media/model";
import type { GridRange } from "shared/lib/useVirtualGrid";

export const photoGalleryGeometry = (
  cardSize: number,
  information: boolean,
) => ({
  itemWidth: 160 + cardSize * 2,
  imageAspectRatio: 1.5,
  footerHeight: information ? 52 : 24,
});

export function photoViewerRange(params: URLSearchParams): GridRange {
  const position = photoIndex(params.get("photoIndex")) ?? 0;
  return {
    start: Math.max(0, position - 64),
    end: position + 64,
    visibleStart: position,
    visibleEnd: position,
  };
}

export function photoItems<T>(
  items: ReadonlyMap<number, T>,
  getItem: (record: T) => MediaItemData | undefined,
) {
  return new Map(
    Array.from(items).flatMap(([index, record]) => {
      const item = getItem(record);
      return item ? [[index, item] as const] : [];
    }),
  );
}

export function photoIndex(value: string | null) {
  const index = value && /^\d+$/.test(value) ? Number(value) : NaN;
  return Number.isSafeInteger(index) ? index : null;
}

/** Never skip an unloaded page or navigate using an index from an older order. */
export function adjacentPhoto<T extends { type: string; ratingKey?: string }>(
  items: ReadonlyMap<number, T>,
  id: string,
  index: number | null,
  direction: 1 | -1,
) {
  if (index === null) return;
  const selected = items.get(index);
  if (selected?.type !== "photo" || selected.ratingKey !== id) return;
  for (let offset = index + direction; offset >= 0; offset += direction) {
    const item = items.get(offset);
    if (!item) return;
    if (item.type === "photo") return [offset, item] as const;
  }
}

export function photoAspectRatio(item: MediaItemData | undefined) {
  const media = item?.Media?.[0];
  if (
    media &&
    "width" in media &&
    "height" in media &&
    media.width &&
    media.height
  )
    return Math.min(3, Math.max(0.4, media.width / media.height));
  return 1.5;
}
export function photoMonth(item: MediaItemData) {
  const date = item.originallyAvailableAt;
  if (!date || !/^\d{4}-(0[1-9]|1[0-2])/.test(date)) return "Undated";
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${date.slice(0, 7)}-01T00:00:00Z`));
}
