import {
  authedGetStrict,
  getXPlexProps,
} from "features/session/model";
import { getIncludeProps } from "entities/media/model";
import { queryBuilder } from "shared/lib/query";

function container<T>(response: unknown): T {
  const value = response as { MediaContainer?: T } | null;
  if (!value?.MediaContainer)
    throw new Error("Plex returned an invalid home response");
  return value.MediaContainer;
}

export async function getHomeLibraries(): Promise<Plex.LibarySection[]> {
  const response = await authedGetStrict("/library/sections");
  return container<{ Directory?: Plex.LibarySection[] }>(response).Directory || [];
}

export async function getHomeGenres(libraryKey: string) {
  const response = await authedGetStrict(
    `/library/sections/${encodeURIComponent(libraryKey)}/genre`,
  );
  return container<Plex.MediaContainer>(response).Directory || [];
}

export async function getHomeLibraryWindow(
  libraryKey: string,
  start: number,
  size: number,
) {
  const response = await authedGetStrict(
    `/library/sections/${encodeURIComponent(libraryKey)}/all?${queryBuilder({
      sort: "titleSort:asc",
      "X-Plex-Container-Start": start,
      "X-Plex-Container-Size": size,
      ...getIncludeProps(),
    })}`,
  );
  return container<Plex.MediaContainer>(response);
}

export async function getHomeMetadata(ratingKey: string) {
  const response = await authedGetStrict(
    `/library/metadata/${encodeURIComponent(ratingKey)}?${queryBuilder({
      ...getIncludeProps(),
      ...getXPlexProps(),
    })}`,
  );
  return container<Plex.MediaContainer>(response).Metadata?.[0] ?? null;
}
