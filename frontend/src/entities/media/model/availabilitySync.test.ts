import type { MediaMetadata } from "plex/media";
import { QueryObserver } from "@tanstack/react-query";
import type { MediaItemUpdate } from "./mediaChanges";
import type { LibraryCardDto } from "@nevu/contracts";
import { createQueryClient } from "shared/api/queryClient";
import { availabilityQueryOptions } from "./availabilityQuery";
import { applyAvailabilityChanges } from "./availabilitySync";

const scope = { serverId: "server", profileKey: "owner" };
const client = createQueryClient();
const card: LibraryCardDto = {
  ratingKey: "1",
  guid: "old",
  title: "Movie",
  type: "movie",
  librarySectionID: 1,
};
const movie = card as MediaMetadata;
const key = (guids: string[], activeScope = scope) =>
  availabilityQueryOptions(activeScope, guids).queryKey;
const changed = (update: MediaItemUpdate) =>
  applyAvailabilityChanges(client, [
    {
      change: { ...scope, kind: "item", effect: "unknown", id: "1", sectionId: "1" },
      update,
    },
  ]);
afterEach(() => client.clear());

it("moves a matched edition between GUID queries and preserves other local editions", async () => {
  const edition = { ...movie, ratingKey: "2" };
  client.setQueryData(key(["old"]), [movie, edition]);
  client.setQueryData(key(["new"]), []);
  const updated = { ...movie, guid: "new" };
  await changed({ item: { ...card, guid: "new" }, metadata: updated, sectionId: "1" });
  expect(client.getQueryData(key(["old"]))).toEqual([edition]);
  expect(client.getQueryData(key(["new"]))).toEqual([updated]);
});

it("refreshes only the requested GUID affected by a newly available copy lacking full metadata", async () => {
  const reads = [vi.fn(async () => [movie]), vi.fn(async () => [])];
  const stops = ["old", "unrelated"].map((guid, index) =>
    new QueryObserver(client, {
      queryKey: key([guid]),
      queryFn: reads[index],
      initialData: [],
      staleTime: Infinity,
    }).subscribe(() => {}),
  );
  try {
    await changed({ item: card, sectionId: "1" });
    expect(reads[0]).toHaveBeenCalledTimes(1);
    expect(reads[1]).not.toHaveBeenCalled();
  } finally {
    stops.forEach((stop) => stop());
  }
});

it("removes a deleted copy without losing availability from another edition", async () => {
  const edition = { ...movie, ratingKey: "2" };
  client.setQueryData(key(["old"]), [movie, edition]);
  await changed({ item: null, sectionId: "1" });
  expect(client.getQueryData(key(["old"]))).toEqual([edition]);
});

it("leaves other servers, profiles and unrelated GUIDs untouched", async () => {
  const keys = [
    key(["old"], { ...scope, serverId: "other" }),
    key(["old"], { ...scope, profileKey: "other" }),
    key(["unrelated"]),
  ];
  const unrelated = { ...movie, ratingKey: "99", guid: "unrelated" };
  client.setQueryData(keys[0], [movie]);
  client.setQueryData(keys[1], [movie]);
  client.setQueryData(keys[2], [unrelated]);
  client.setQueryData(key(["old"]), [movie]);
  await changed({ item: card, metadata: { ...movie, title: "Updated" }, sectionId: "1" });
  expect(client.getQueryData(keys[0])).toEqual([movie]);
  expect(client.getQueryData(keys[1])).toEqual([movie]);
  expect(client.getQueryData(keys[2])).toEqual([unrelated]);
  expect(client.getQueryData(key(["old"]))).toEqual([{ ...movie, title: "Updated" }]);
});

it("cancels an older native read before publishing confirmed metadata", async () => {
  let finish!: (items: MediaMetadata[]) => void;
  let signal!: AbortSignal;
  const queryKey = key(["old"]);
  client.setQueryData(queryKey, [movie]);
  const stop = new QueryObserver(client, {
    queryKey,
    queryFn: (context) => {
      signal = context.signal;
      return new Promise<MediaMetadata[]>((resolve) => {
        finish = resolve;
      });
    },
    staleTime: 0,
  }).subscribe(() => {});
  try {
    const metadata = { ...movie, title: "Confirmed" };
    await changed({ item: { ...card, title: "Confirmed" }, metadata, sectionId: "1" });
    expect(signal.aborted).toBe(true);
    finish([movie]);
    await Promise.resolve();
    expect(client.getQueryData(queryKey)).toEqual([metadata]);
  } finally {
    stop();
  }
});
