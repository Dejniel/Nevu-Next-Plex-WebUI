import {
  authedGetStrict,
  getIncludeProps,
  queryBuilder,
} from "plex/QuickFunctions";

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
  return response.MediaContainer;
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
