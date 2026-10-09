import type { MediaMetadata } from "plex/media";
import { AuthStorage } from "features/session/model";
import { PlexClient } from "shared/api/PlexClient";

const GUID_BATCH_SIZE = 50;
const MATCH_PAGE_SIZE = 200;

/** Resolve every accessible local copy, including editions in other libraries. */
export async function getLocalMediaMatches(
  guids: readonly string[],
  signal?: AbortSignal,
): Promise<MediaMetadata[]> {
  const token = AuthStorage.getServerToken();
  if (!token) throw new Error("The active Plex session is missing.");
  const client = new PlexClient(() => token);
  const unique = [...new Set(guids.filter(Boolean))];
  const batches: string[][] = [];
  for (let index = 0; index < unique.length; index += GUID_BATCH_SIZE)
    batches.push(unique.slice(index, index + GUID_BATCH_SIZE));
  const results: MediaMetadata[][] = [];
  let nextBatch = 0;

  await Promise.all(
    Array.from({ length: Math.min(4, batches.length) }, async () => {
      while (nextBatch < batches.length) {
        const batchIndex = nextBatch++;
        const batch = batches[batchIndex];
        const matches: MediaMetadata[] = [];
        const seen = new Set<string>();
        let offset = 0;
        while (true) {
          signal?.throwIfAborted();
          const params = new URLSearchParams({
            guid: batch.join(","),
            includeExternalMedia: "0",
            "X-Plex-Container-Start": String(offset),
            "X-Plex-Container-Size": String(MATCH_PAGE_SIZE),
          });
          const response = await client.get<{
            MediaContainer?: Plex.MediaContainer;
          }>(`/library/all?${params}`, signal);
          const container = response.MediaContainer;
          if (!container)
            throw new Error("Plex returned invalid availability data.");
          const page = container.Metadata ?? [];
          const previousSize = seen.size;
          page.forEach((item) => seen.add(item.ratingKey));
          matches.push(
            ...page.filter(
              (item) =>
                item.guid && batch.includes(item.guid) &&
                /^\d+$/.test(item.ratingKey) &&
                (item.librarySectionID ?? 0) > 0,
            ),
          );
          offset += page.length;
          if (page.length && seen.size === previousSize)
            throw new Error("Plex returned incomplete availability data.");
          if (
            container.totalSize !== undefined
              ? offset >= container.totalSize
              : page.length < MATCH_PAGE_SIZE
          )
            break;
          if (!page.length)
            throw new Error("Plex returned incomplete availability data.");
        }
        results[batchIndex] = matches;
      }
    }),
  );
  return results.flat();
}
