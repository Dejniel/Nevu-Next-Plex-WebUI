import {
  authedGet,
  authedGetStrict,
  getIncludeProps,
  getXPlexProps,
  queryBuilder,
} from "plex/QuickFunctions";
import { invalidateLibraryCache } from "shared/lib/libraryCache";

export async function getMediaMetadata(id: string): Promise<Plex.Metadata> {
  if (!id) return {} as Plex.Metadata;
  const response = await authedGetStrict(
    `/library/metadata/${id}?${queryBuilder({
      ...getIncludeProps(),
      ...getXPlexProps(),
    })}`,
  );
  return response.MediaContainer.Metadata[0];
}

export async function getMediaChildren(id: string): Promise<Plex.Metadata[]> {
  const response = await authedGetStrict(
    `/library/metadata/${id}/children?${queryBuilder({
      ...getIncludeProps(),
      ...getXPlexProps(),
    })}`,
  );
  return response.MediaContainer.Metadata ?? [];
}

export async function getMediaByGuid(
  guid: string,
): Promise<Plex.Metadata | null> {
  const response = await authedGetStrict(
    `/library/all?${queryBuilder({
      guid,
      includeExternalMedia: 1,
      includeMeta: 1,
      includeMarkerCounts: 1,
      includeRelated: 1,
    })}`,
  );
  const metadata = response.MediaContainer.Metadata?.[0];
  return metadata?.guid === guid ? metadata : null;
}

export async function setMediaPlayedStatus(
  watched: boolean,
  ratingKey: string,
): Promise<void> {
  await authedGet(
    `/:/${watched ? "scrobble" : "unscrobble"}?${queryBuilder({
      key: ratingKey,
      identifier: "com.plexapp.plugins.library",
      ...getXPlexProps(),
    })}`,
  );
  invalidateLibraryCache();
}
