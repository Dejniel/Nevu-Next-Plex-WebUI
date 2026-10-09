import { normalizeLibraryRecord } from "@nevu/contracts";
import { plexClient, getXPlexProps } from "features/session/model";
import { queryBuilder } from "shared/lib/query";
import { getIncludeProps } from "../model/mediaIncludes";

interface MediaResponse {
  MediaContainer?: {
    Metadata?: Plex.Metadata[];
    Directory?: Plex.Metadata[];
  };
}

async function getMediaContainer(path: string, signal?: AbortSignal) {
  const response = await plexClient.get<MediaResponse>(path, signal);
  const container = response?.MediaContainer;
  if (
    !container ||
    typeof container !== "object" ||
    Array.isArray(container) ||
    (container.Metadata !== undefined && !Array.isArray(container.Metadata)) ||
    (container.Directory !== undefined && !Array.isArray(container.Directory))
  )
    throw new Error("Plex returned an invalid media response.");
  return container;
}

export async function getMediaMetadata(
  id: string,
  signal?: AbortSignal,
): Promise<Plex.Metadata> {
  if (!id) throw new Error("No media item was selected.");
  const container = await getMediaContainer(
    `/library/metadata/${encodeURIComponent(id)}?${queryBuilder({
      ...getIncludeProps(),
      ...getXPlexProps(),
    })}`,
    signal,
  );
  const item = container.Metadata?.[0] ?? container.Directory?.[0];
  if (!item) throw new Error("This item is no longer available in Plex.");
  return normalizeLibraryRecord(item, !container.Metadata?.length);
}

export async function getMediaChildren(
  id: string,
  signal?: AbortSignal,
): Promise<Plex.Metadata[]> {
  const container = await getMediaContainer(
    `/library/metadata/${encodeURIComponent(id)}/children?${queryBuilder({
      ...getIncludeProps(),
      ...getXPlexProps(),
    })}`,
    signal,
  );
  return [
    ...(container.Metadata ?? []).map((item: Plex.Metadata) =>
      normalizeLibraryRecord(item),
    ),
    ...(container.Directory ?? []).map((item: Plex.Metadata) =>
      normalizeLibraryRecord(item, true),
    ),
  ];
}

export async function getMediaByGuid(
  guid: string,
  signal?: AbortSignal,
): Promise<Plex.Metadata | null> {
  const container = await getMediaContainer(
    `/library/all?${queryBuilder({
      guid,
      includeExternalMedia: 1,
      includeMeta: 1,
      includeMarkerCounts: 1,
      includeRelated: 1,
    })}`,
    signal,
  );
  const metadata = container.Metadata?.[0];
  return metadata?.guid === guid ? metadata : null;
}
