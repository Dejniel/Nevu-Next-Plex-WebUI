import { durationToText } from "shared/lib/duration";
import type { MediaItemData } from "./media";
import type { MediaArtworkLayout } from "./mediaArtwork";

export function mediaCardText(item: MediaItemData, layout: MediaArtworkLayout) {
  if (item.type === "season")
    return {
      title: item.parentTitle || item.title,
      subtitle: [
        item.title,
        item.leafCount
          ? `${item.leafCount} ${item.leafCount === 1 ? "Episode" : "Episodes"}`
          : null,
        item.year,
      ]
        .filter(Boolean)
        .join(" · "),
    };
  if (item.type === "episode") {
    const title = item.grandparentTitle || item.parentTitle || item.title;
    const code = [
      item.parentIndex !== undefined
        ? `S${String(item.parentIndex).padStart(2, "0")}`
        : null,
      item.index !== undefined
        ? `E${String(item.index).padStart(2, "0")}`
        : null,
    ]
      .filter(Boolean)
      .join(" ");
    return {
      title,
      subtitle: [code, title !== item.title ? item.title : null]
        .filter(Boolean)
        .join(" · "),
    };
  }
  let details: Array<string | number | null | undefined>;
  switch (item.type) {
    case "artist":
      details = [
        item.childCount
          ? `${item.childCount} ${item.childCount === 1 ? "Album" : "Albums"}`
          : null,
      ];
      break;
    case "album":
      details = [
        item.parentTitle,
        item.year,
        item.leafCount
          ? `${item.leafCount} ${item.leafCount === 1 ? "Track" : "Tracks"}`
          : null,
      ];
      break;
    case "track": {
      const seconds = Math.floor((item.duration ?? 0) / 1000);
      const duration =
        seconds > 0
          ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
          : null;
      details = [item.grandparentTitle, item.parentTitle, duration];
      break;
    }
    case "photo":
      details = [item.parentTitle, item.originallyAvailableAt];
      break;
    case "photoalbum":
      details = [
        item.parentTitle,
        item.childCount ? `${item.childCount} items` : null,
      ];
      break;
    default:
      details = [
        item.year,
        item.type === "movie" && item.duration
          ? durationToText(item.duration)
          : null,
        item.type === "show" && (item.seasonCount ?? item.childCount)
          ? `${item.seasonCount ?? item.childCount} ${(item.seasonCount ?? item.childCount) === 1 ? "Season" : "Seasons"}`
          : null,
        item.Genre?.slice(0, layout === "landscape" ? 2 : 1)
          .map((genre) => genre.tag)
          .join(", "),
      ];
  }
  return { title: item.title, subtitle: details.filter(Boolean).join(" · ") };
}
