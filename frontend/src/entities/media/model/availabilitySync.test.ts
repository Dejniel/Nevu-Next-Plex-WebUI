import type { LocalMediaMatch } from "./mediaAvailability";
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
  guid: "plex://movie/old",
  title: "Movie",
  type: "movie",
  librarySectionID: 1,
};
const movie: LocalMediaMatch = {
  ...card,
  type: "movie",
  guid: "plex://movie/old",
  librarySectionID: 1,
};
const key = (guids: string[], activeScope = scope) =>
  availabilityQueryOptions(activeScope, guids).queryKey;
const changed = (update: MediaItemUpdate) =>
  applyAvailabilityChanges(client, [
    {
      change: {
        ...scope,
        kind: "item",
        effect: "unknown",
        id: "1",
        sectionId: "1",
      },
      update,
    },
  ]);
afterEach(() => client.clear());

it("moves a matched edition between GUID queries and preserves other local editions", async () => {
  const edition = { ...movie, ratingKey: "2" };
  client.setQueryData(key(["plex://movie/old"]), [movie, edition]);
  client.setQueryData(key(["plex://movie/new"]), []);
  const updated = { ...movie, guid: "plex://movie/new" };
  await changed({
    item: { ...card, guid: "plex://movie/new" },
    metadata: updated,
    sectionId: "1",
  });
  expect(client.getQueryData(key(["plex://movie/old"]))).toEqual([edition]);
  expect(client.getQueryData(key(["plex://movie/new"]))).toEqual([updated]);
});

it("refreshes only the requested GUID affected by a newly available copy lacking full metadata", async () => {
  const reads = [vi.fn(async () => [movie]), vi.fn(async () => [])];
  const stops = ["plex://movie/old", "plex://movie/unrelated"].map(
    (guid, index) =>
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
  client.setQueryData(key(["plex://movie/old"]), [movie, edition]);
  await changed({ item: null, sectionId: "1" });
  expect(client.getQueryData(key(["plex://movie/old"]))).toEqual([edition]);
});

it("leaves other servers, profiles and unrelated GUIDs untouched", async () => {
  const keys = [
    key(["plex://movie/old"], { ...scope, serverId: "other" }),
    key(["plex://movie/old"], { ...scope, profileKey: "other" }),
    key(["plex://movie/unrelated"]),
  ];
  const unrelated = {
    ...movie,
    ratingKey: "99",
    guid: "plex://movie/unrelated",
  };
  client.setQueryData(keys[0], [movie]);
  client.setQueryData(keys[1], [movie]);
  client.setQueryData(keys[2], [unrelated]);
  client.setQueryData(key(["plex://movie/old"]), [movie]);
  await changed({
    item: card,
    metadata: { ...movie, title: "Updated" },
    sectionId: "1",
  });
  expect(client.getQueryData(keys[0])).toEqual([movie]);
  expect(client.getQueryData(keys[1])).toEqual([movie]);
  expect(client.getQueryData(keys[2])).toEqual([unrelated]);
  expect(client.getQueryData(key(["plex://movie/old"]))).toEqual([
    { ...movie, title: "Updated" },
  ]);
});

it("cancels an older native read before publishing confirmed metadata", async () => {
  let finish!: (items: LocalMediaMatch[]) => void;
  let signal!: AbortSignal;
  const queryKey = key(["plex://movie/old"]);
  client.setQueryData(queryKey, [movie]);
  const stop = new QueryObserver(client, {
    queryKey,
    queryFn: (context) => {
      signal = context.signal;
      return new Promise<LocalMediaMatch[]>((resolve) => {
        finish = resolve;
      });
    },
    staleTime: 0,
  }).subscribe(() => {});
  try {
    const metadata = { ...movie, title: "Confirmed" };
    await changed({
      item: { ...card, title: "Confirmed" },
      metadata,
      sectionId: "1",
    });
    expect(signal.aborted).toBe(true);
    finish([movie]);
    await Promise.resolve();
    expect(client.getQueryData(queryKey)).toEqual([metadata]);
  } finally {
    stop();
  }
});

it.each([
  { guid: "com.plexapp.agents.none://local" },
  { guid: "plex://show/old" },
  { librarySectionID: 0 },
  { librarySectionID: undefined },
])(
  "removes a copy which no longer has a valid local title identity: %j",
  async (change) => {
    const edition = { ...movie, ratingKey: "2" };
    client.setQueryData(key([movie.guid]), [movie, edition]);
    const metadata = { ...movie, ...change };
    await changed({ item: { ...card, ...change }, metadata, sectionId: "1" });
    expect(client.getQueryData(key([movie.guid]))).toEqual([edition]);
  },
);
