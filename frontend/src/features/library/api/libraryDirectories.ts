import {
  authedGetStrict,
} from "features/session/model";
import { getIncludeProps } from "entities/media/model";
import { queryBuilder } from "shared/lib/query";

export async function getLibrary(key: string): Promise<Plex.MediaContainer> {
  const response = await authedGetStrict(
    `/library/sections/${key}?${queryBuilder({ includeDetails: 1 })}`,
  );
  return response.MediaContainer;
}

export async function getLibraryDirectory(
  key: string,
  props?: Record<string, unknown>,
): Promise<Plex.MediaContainer> {
  const response = await authedGetStrict(
    `${key}?${queryBuilder({ ...props, ...getIncludeProps() })}`,
  );
  const container = response?.MediaContainer;
  if (!container) throw new Error("Plex returned an invalid library directory");
  return { ...container, Metadata: container.Metadata ?? [] };
}

export async function getLibrarySecondary(
  key: string,
  directory: string,
): Promise<Plex.Directory[]> {
  const response = await authedGetStrict(
    `/library/sections/${key}/${directory}`,
  );
  return response.MediaContainer.Directory ?? [];
}
