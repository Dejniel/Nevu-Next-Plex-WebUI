import { AuthStorage } from "features/session/model";
import { PlexClient } from "shared/api/PlexClient";
import { readPlexMetadataPages } from "shared/api/plexPagination";
import { PlexResponseError } from "shared/api/plexResponse";
import { readMediaMetadata } from "./mediaMetadata";
import { getPlexTitleIdentity } from "../model/mediaIdentity";
import {
  isLocalMediaMatch,
  type LocalMediaMatch,
} from "../model/mediaAvailability";

const GUID_BATCH_SIZE = 50;
const MATCH_PAGE_SIZE = 200;

/** Resolve every accessible local copy, including editions in other libraries. */
export async function getLocalMediaMatches(
  guids: readonly string[],
  signal?: AbortSignal,
): Promise<LocalMediaMatch[]> {
  signal?.throwIfAborted();
  const unique = [...new Set(guids)];
  if (unique.some((guid) => !getPlexTitleIdentity(guid)))
    throw new PlexResponseError("availability identifiers");
  if (!unique.length) return [];
  const token = AuthStorage.getServerToken();
  if (!token) throw new Error("The active Plex session is missing.");
  const client = new PlexClient(() => token);
  const batches: string[][] = [];
  for (let index = 0; index < unique.length; index += GUID_BATCH_SIZE)
    batches.push(unique.slice(index, index + GUID_BATCH_SIZE));
  const results: LocalMediaMatch[][] = [];
  let nextBatch = 0;

  await Promise.all(
    Array.from({ length: Math.min(4, batches.length) }, async () => {
      while (nextBatch < batches.length) {
        const batchIndex = nextBatch++;
        const batch = batches[batchIndex];
        const items = await readPlexMetadataPages({
          resource: "availability data",
          pageSize: MATCH_PAGE_SIZE,
          signal,
          readItem: (row) => readMediaMetadata(row),
          identity: (item) => item.ratingKey,
          fetchPage: (offset) => {
            const params = new URLSearchParams({
              guid: batch.join(","),
              includeExternalMedia: "0",
              "X-Plex-Container-Start": String(offset),
              "X-Plex-Container-Size": String(MATCH_PAGE_SIZE),
            });
            return client.get<unknown>(`/library/all?${params}`, signal);
          },
        });
        results[batchIndex] = items
          .filter(isLocalMediaMatch)
          .filter((item) => batch.includes(item.guid));
      }
    }),
  );
  return [
    ...new Map(results.flat().map((item) => [item.ratingKey, item])).values(),
  ];
}
