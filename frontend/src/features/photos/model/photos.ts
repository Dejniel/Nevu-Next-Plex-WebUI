import type { MediaItemData } from "entities/media/model";

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
