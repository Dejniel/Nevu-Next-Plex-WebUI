import type { To } from "react-router-dom";
import {
  type AppLocation,
  libraryBrowseTo,
  mediaDetailsTo,
} from "shared/lib/navigation";

export function searchResultTo(
  location: AppLocation,
  result: Plex.SearchResult,
): To | null {
  if (result.Metadata) return mediaDetailsTo(location, result.Metadata);
  if (!result.Directory) return null;

  return libraryBrowseTo(
    location,
    `/library/sections/${result.Directory.librarySectionID}/genre/${result.Directory.id}`,
  );
}
