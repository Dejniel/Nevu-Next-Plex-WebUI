import type { MediaMetadata } from "plex/media";
import { plexClient, getXPlexProps } from "features/session/model";
import { queryBuilder } from "shared/lib/query";
import { getIncludeProps } from "../model/mediaIncludes";
import {
  readMediaContainer,
  readMediaMetadata,
  readDirectoryMetadata,
} from "./mediaMetadata";
import { PlexResponseError } from "shared/api/plexResponse";

async function getMediaContainer(path: string, signal?: AbortSignal) {
  return readMediaContainer(await plexClient.get<unknown>(path, signal));
}

export async function getMediaMetadata(
  id: string,
  signal?: AbortSignal,
): Promise<MediaMetadata> {
  if (!id) throw new Error("No media item was selected.");
  const container = await getMediaContainer(
    `/library/metadata/${encodeURIComponent(id)}?${queryBuilder({
      ...getIncludeProps(),
      ...getXPlexProps(),
    })}`,
    signal,
  );
  const item = container.Metadata.length
    ? readMediaMetadata(container.Metadata[0], id)
    : container.Directory.map(readDirectoryMetadata).find(Boolean);
  if (!item) throw new Error("This item is no longer available in Plex.");
  if (item.ratingKey !== id) throw new PlexResponseError("media metadata");
  return item;
}

export async function getMediaChildren(
  id: string,
  signal?: AbortSignal,
): Promise<MediaMetadata[]> {
  const container = await getMediaContainer(
    `/library/metadata/${encodeURIComponent(id)}/children?${queryBuilder({
      ...getIncludeProps(),
      ...getXPlexProps(),
    })}`,
    signal,
  );
  return [
    ...container.Metadata.map((item) => readMediaMetadata(item)),
    ...container.Directory.flatMap((item) => {
      const metadata = readDirectoryMetadata(item);
      return metadata ? [metadata] : [];
    }),
  ];
}

export async function getMediaByGuid(
  guid: string,
  signal?: AbortSignal,
): Promise<MediaMetadata | null> {
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
  const metadata = container.Metadata.length
    ? readMediaMetadata(container.Metadata[0])
    : null;
  return metadata?.guid === guid ? metadata : null;
}
