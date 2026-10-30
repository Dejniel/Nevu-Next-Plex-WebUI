import { plexClient } from "features/session/model";
import { getIncludeProps } from "entities/media/model";
import { queryBuilder } from "shared/lib/query";
import { readLibraryCatalog } from "entities/library/model";

export async function getLibraryDirectory(
  key: string,
  props?: Record<string, unknown>,
  signal?: AbortSignal,
) {
  const url = `${key}${key.includes("?") ? "&" : "?"}${queryBuilder({ ...props, ...getIncludeProps() })}`;
  const params = new URL(url, "http://plex").searchParams;
  const start = params.get("X-Plex-Container-Start");
  const size = params.get("X-Plex-Container-Size");
  const window =
    start !== null && size !== null
      ? { offset: Number(start), size: Number(size) }
      : undefined;
  return readLibraryCatalog(await plexClient.get<unknown>(url, signal), window);
}
