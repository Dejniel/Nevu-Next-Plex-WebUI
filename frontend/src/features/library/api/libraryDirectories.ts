import { authedGetStrict } from "features/session/model";
import { getIncludeProps } from "entities/media/model";
import { queryBuilder } from "shared/lib/query";

export async function getLibraryDirectory(
  key: string,
  props?: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<Plex.MediaContainer> {
  const response = await authedGetStrict(
    `${key}?${queryBuilder({ ...props, ...getIncludeProps() })}`,
    signal,
  );
  const container = response?.MediaContainer;
  if (!container) throw new Error("Plex returned an invalid library directory");
  return { ...container, Metadata: container.Metadata ?? [] };
}
