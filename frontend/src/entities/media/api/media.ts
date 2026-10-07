import { normalizeLibraryRecord } from "@nevu/contracts";
import { publishMediaChange } from "../model/mediaChanges";
import { authedGetStrict, getActiveServerScope, getXPlexProps } from "features/session/model";
import { queryBuilder } from "shared/lib/query";
import { getIncludeProps } from "../model/mediaIncludes";

export async function getMediaMetadata(id: string, signal?: AbortSignal): Promise<Plex.Metadata> {
  if (!id) return {} as Plex.Metadata;
  const response = await authedGetStrict(
    `/library/metadata/${id}?${queryBuilder({
      ...getIncludeProps(),
      ...getXPlexProps(),
    })}`,
    signal,
  );
  const container = response.MediaContainer;
  const item = container.Metadata?.[0] ?? container.Directory?.[0];
  if (!item) throw new Error("This item is no longer available in Plex.");
  return normalizeLibraryRecord(item, !container.Metadata?.length);
}

export async function getMediaChildren(id: string, signal?: AbortSignal): Promise<Plex.Metadata[]> {
  const response = await authedGetStrict(
    `/library/metadata/${id}/children?${queryBuilder({
      ...getIncludeProps(),
      ...getXPlexProps(),
    })}`,
    signal,
  );
  const container = response.MediaContainer;
  return [
    ...(container.Metadata ?? []).map((item: Plex.Metadata) => normalizeLibraryRecord(item)),
    ...(container.Directory ?? []).map((item: Plex.Metadata) => normalizeLibraryRecord(item, true)),
  ];
}

export async function getMediaByGuid(
  guid: string,
  signal?: AbortSignal,
): Promise<Plex.Metadata | null> {
  const response = await authedGetStrict(
    `/library/all?${queryBuilder({
      guid,
      includeExternalMedia: 1,
      includeMeta: 1,
      includeMarkerCounts: 1,
      includeRelated: 1,
    })}`,
    signal,
  );
  const metadata = response.MediaContainer.Metadata?.[0];
  return metadata?.guid === guid ? metadata : null;
}

export async function setMediaPlayedStatus(watched: boolean, ratingKey: string): Promise<void> {
  const scope = getActiveServerScope();
  await authedGetStrict(
    `/:/${watched ? "scrobble" : "unscrobble"}?${queryBuilder({
      key: ratingKey,
      identifier: "com.plexapp.plugins.library",
      ...getXPlexProps(),
    })}`,
  );
  if (scope)
    publishMediaChange({
      ...scope,
      kind: "item",
      effect: "unknown",
      id: ratingKey,
    });
}
