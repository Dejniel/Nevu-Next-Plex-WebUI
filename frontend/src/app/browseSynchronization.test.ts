import { focusManager, QueryObserver } from "@tanstack/react-query";
import { createQueryClient } from "shared/api/queryClient";
import {
  invalidateRandomCatalogs,
  synchronizeLibraryItem,
  libraryWindowKey,
  libraryPageOptions,
  libraryDirectoryQueryOptions,
} from "features/library/model";
import { listPageOptions, mediaListWindowKey } from "features/media-lists/model";
import { startBrowseSynchronization } from "./browseSynchronization";
import {
  availabilityQueryOptions,
  mediaMetadataQueryKey,
  mediaChildrenQueryOptions,
} from "entities/media/model";
import type { LibraryCardDto } from "@nevu/contracts";

vi.mock("features/library/model", async (importOriginal) => ({
  ...(await importOriginal<typeof import("features/library/model")>()),
  invalidateRandomCatalogs: vi.fn(),
  synchronizeLibraryItem: vi.fn(),
}));
const scope = { serverId: "server", profileKey: "owner" };
const client = createQueryClient();
let close: () => void;
let sync: ReturnType<typeof startBrowseSynchronization>;
const refresh = vi.fn(async () => ({ revision: 1 }));
beforeEach(() => {
  vi.useFakeTimers();
  vi.resetAllMocks();
  focusManager.setFocused(true);
  vi.mocked(invalidateRandomCatalogs).mockResolvedValue(undefined);
  vi.mocked(synchronizeLibraryItem).mockResolvedValue({ item: null, sectionId: "1" });
  refresh.mockResolvedValue({ revision: 1 });
  close = new QueryObserver(client, {
    queryKey: libraryWindowKey("server", { profileKey: "owner", sectionId: 1, sort: "titleSort" }),
    queryFn: refresh,
    initialData: { revision: 0 },
    staleTime: Infinity,
  }).subscribe(() => {});
  sync = startBrowseSynchronization(scope, () => true, client);
});
afterEach(() => {
  sync.dispose();
  close();
  client.clear();
  vi.useRealTimers();
  focusManager.setFocused(undefined);
});

it.each(["membership", "unknown"] as const)("refreshes full season/show metadata after a deleted episode (%s)", async (effect) => {
  const episode = {
    ratingKey: "101", type: "episode", librarySectionID: 1,
    parentRatingKey: "100", grandparentRatingKey: "99",
  } as Plex.Metadata;
  const reads = [vi.fn(async () => ({ leafCount: 0 })), vi.fn(async () => ({ leafCount: 0 }))];
  const stops = ["100", "99"].map((id, index) => new QueryObserver(client, {
    queryKey: mediaMetadataQueryKey(scope, id),
    queryFn: reads[index],
    initialData: { ratingKey: id, type: index ? "show" : "season", librarySectionID: 1, leafCount: 1 },
    staleTime: Infinity,
  }).subscribe(() => {}));
  const children = mediaChildrenQueryOptions(scope, "100");
  const readChildren = vi.fn(async () => [] as Plex.Metadata[]);
  stops.push(new QueryObserver(client, {
    ...children, queryFn: readChildren, initialData: [episode], staleTime: Infinity,
  }).subscribe(() => {}));
  vi.mocked(synchronizeLibraryItem).mockResolvedValue({ item: null });
  try {
    sync.enqueue({ ...scope, sectionId: "1", kind: "item", effect, id: "101" });
    await vi.advanceTimersByTimeAsync(1000);
    expect(readChildren).toHaveBeenCalledTimes(1);
    expect(reads.map((read) => read.mock.calls.length)).toEqual([1, 1]);
    expect(refresh).toHaveBeenCalledTimes(1);
  } finally { stops.forEach((stop) => stop()); }
});

it("uses scoped parent recovery when a deleted item's relationships are unavailable", async () => {
  const reads = Array.from({ length: 4 }, () => vi.fn(async () => ({ leafCount: 0 })));
  const stops = [
    { id: "show-1", section: 1, activeScope: scope },
    { id: "show-2", section: 2, activeScope: scope },
    { id: "show-guest", section: 1, activeScope: { ...scope, profileKey: "guest" } },
    { id: "movie-1", section: 1, activeScope: scope, type: "movie" },
  ].map(({ id, section, activeScope, type }, index) => new QueryObserver(client, {
    queryKey: mediaMetadataQueryKey(activeScope, id), queryFn: reads[index],
    initialData: { ratingKey: id, type: type ?? "show", librarySectionID: section, leafCount: 1 },
    staleTime: Infinity,
  }).subscribe(() => {}));
  vi.mocked(synchronizeLibraryItem).mockResolvedValue({ item: null });
  try {
    sync.enqueue({ ...scope, sectionId: "1", kind: "item", effect: "unknown", id: "101" });
    await vi.advanceTimersByTimeAsync(1000);
    expect(reads.map((read) => read.mock.calls.length)).toEqual([1, 0, 0, 0]);
  } finally { stops.forEach((stop) => stop()); }
});

it.each(["library", "directory", "playlist", "availability", "onDeck"])(
  "retains parent evidence from %s before a membership refresh removes it", async (source) => {
    const episode = {
      ratingKey: "101", type: "episode", librarySectionID: 1,
      parentRatingKey: "100", grandparentRatingKey: "99",
    } as Plex.Metadata;
    const show = { ratingKey: "99", type: "show", librarySectionID: 1, leafCount: 1,
      ...(source === "onDeck" && { OnDeck: { Metadata: episode } }),
    } as Plex.Metadata;
    if (source === "library") client.setQueryData(libraryPageOptions("server", {
      profileKey: "owner", sectionId: 1, type: "episode", sort: "titleSort",
    }, 0, 0).queryKey, { offset: 0, size: 1, totalSize: 1, hasMore: false, items: [episode as LibraryCardDto] });
    if (source === "directory") client.setQueryData(libraryDirectoryQueryOptions(scope,
      "/library/sections/1/all", { type: 4 },
    ).queryKey, { Metadata: [episode] } as Plex.MediaContainer);
    if (source === "playlist") client.setQueryData(listPageOptions(scope,
      { kind: "playlist", id: "20" }, 0, 0,
    ).queryKey, { offset: 0, total: 1, summary: null, items: [{ kind: "media", supported: true, position: 0, item: episode }] });
    if (source === "availability") client.setQueryData(availabilityQueryOptions(scope, ["episode"]).queryKey, [episode]);
    const read = vi.fn(async () => ({ ...show, OnDeck: undefined, leafCount: 0 }));
    const stop = new QueryObserver(client, {
      queryKey: mediaMetadataQueryKey(scope, "99"), queryFn: read, initialData: show, staleTime: Infinity,
    }).subscribe(() => {});
    try {
      sync.enqueue({ ...scope, sectionId: "1", kind: "item", effect: "membership", id: "101" });
      await vi.advanceTimersByTimeAsync(1000);
      expect(read).toHaveBeenCalledTimes(1);
    } finally { stop(); }
  },
);

it("cancels a cold parent read before it can publish pre-change aggregates", async () => {
  client.setQueryData(mediaChildrenQueryOptions(scope, "100").queryKey, [{
    ratingKey: "101", type: "episode", parentRatingKey: "100", grandparentRatingKey: "99", librarySectionID: 1,
  } as Plex.Metadata]);
  const key = mediaMetadataQueryKey(scope, "99");
  let finish!: (value: Plex.Metadata) => void;
  let signal!: AbortSignal;
  const read = vi.fn().mockImplementationOnce((context) => {
    signal = context.signal;
    return new Promise<Plex.Metadata>((resolve) => { finish = resolve; });
  }).mockResolvedValue({ ratingKey: "99", leafCount: 0 });
  const stop = new QueryObserver(client, { queryKey: key, queryFn: read }).subscribe(() => {});
  try {
    sync.enqueue({ ...scope, sectionId: "1", kind: "item", effect: "membership", id: "101" });
    await vi.advanceTimersByTimeAsync(1000);
    expect(signal.aborted).toBe(true);
    finish({ ratingKey: "99", leafCount: 1 } as Plex.Metadata);
    await vi.advanceTimersByTimeAsync(10);
    expect(client.getQueryData(key)).toEqual({ ratingKey: "99", leafCount: 0 });
    expect(read).toHaveBeenCalledTimes(2);
  } finally { stop(); }
});

it("does not let a deleted item's details error block its parent/child reconciliation or duplicate the read", async () => {
  const episode = {
    ratingKey: "101", type: "episode", parentRatingKey: "100", grandparentRatingKey: "99", librarySectionID: 1,
  } as Plex.Metadata;
  const readItem = vi.fn(async () => { throw new Error("404: deleted"); });
  const readParent = vi.fn(async () => ({ ratingKey: "99", leafCount: 0 }));
  const readChildren = vi.fn(async () => [] as Plex.Metadata[]);
  const stops = [
    new QueryObserver(client, { queryKey: mediaMetadataQueryKey(scope, "101"), queryFn: readItem, initialData: episode, staleTime: Infinity }).subscribe(() => {}),
    new QueryObserver(client, { queryKey: mediaMetadataQueryKey(scope, "99"), queryFn: readParent, initialData: { ratingKey: "99", type: "show", leafCount: 1 }, staleTime: Infinity }).subscribe(() => {}),
    new QueryObserver(client, { ...mediaChildrenQueryOptions(scope, "100"), queryFn: readChildren, initialData: [episode], staleTime: Infinity }).subscribe(() => {}),
  ];
  vi.mocked(synchronizeLibraryItem).mockResolvedValue({ item: null });
  try {
    sync.enqueue({ ...scope, sectionId: "1", kind: "item", effect: "unknown", id: "101" });
    await vi.advanceTimersByTimeAsync(1000);
    expect(readItem).toHaveBeenCalledTimes(1);
    expect(readParent).toHaveBeenCalledTimes(1);
    expect(readChildren).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(1);
  } finally { stops.forEach((stop) => stop()); }
});

it("refreshes prior and current parent metadata when an episode moves", async () => {
  const before = {
    ratingKey: "101", type: "episode", librarySectionID: 1,
    parentRatingKey: "100", grandparentRatingKey: "99",
  } as Plex.Metadata;
  client.setQueryData(mediaMetadataQueryKey(scope, "101"), before);
  const reads = Array.from({ length: 4 }, () => vi.fn(async () => ({ leafCount: 1 })));
  const stops = ["100", "99", "200", "199"].map((id, index) => new QueryObserver(client, {
    queryKey: mediaMetadataQueryKey(scope, id), queryFn: reads[index],
    initialData: { ratingKey: id, librarySectionID: 1 }, staleTime: Infinity,
  }).subscribe(() => {}));
  const metadata = { ...before, parentRatingKey: "200", grandparentRatingKey: "199" };
  vi.mocked(synchronizeLibraryItem).mockResolvedValue({
    item: metadata as unknown as LibraryCardDto, metadata, sectionId: "1", parentIds: ["200", "199"],
  });
  try {
    sync.enqueue({ ...scope, sectionId: "1", kind: "item", effect: "unknown", id: "101" });
    await vi.advanceTimersByTimeAsync(1000);
    expect(reads.map((read) => read.mock.calls.length)).toEqual([1, 1, 1, 1]);
    expect(client.getQueryData(mediaMetadataQueryKey(scope, "101"))).toEqual(metadata);
  } finally { stops.forEach((stop) => stop()); }
});

it("preserves the verified before/after delta for directories before publishing canonical metadata", async () => {
  const before = {
    ratingKey: "1", type: "movie", librarySectionID: 1, summary: "Old",
  } as Plex.Metadata;
  client.setQueryData(mediaMetadataQueryKey(scope, "1"), before);
  const reads = Array.from({ length: 3 }, () => vi.fn(async () => ({ size: 0 } as Plex.MediaContainer)));
  const stops = ["/library/sections/1", "/library/sections/1/genre", "/library/sections/1/actor"]
    .map((dir, index) => new QueryObserver(client, {
      ...libraryDirectoryQueryOptions(scope, dir), queryFn: reads[index],
      initialData: { size: 0 } as Plex.MediaContainer, staleTime: Infinity,
    }).subscribe(() => {}));
  const metadata = { ...before, summary: "New" };
  vi.mocked(synchronizeLibraryItem).mockResolvedValue({
    item: metadata as unknown as LibraryCardDto, metadata, sectionId: "1",
  });
  try {
    sync.enqueue({ ...scope, sectionId: "1", kind: "item", effect: "unknown", id: "1" });
    await vi.advanceTimersByTimeAsync(1000);
    expect(reads.map((read) => read.mock.calls.length)).toEqual([0, 0, 0]);
    expect(client.getQueryData(mediaMetadataQueryKey(scope, "1"))).toEqual(metadata);
  } finally { stops.forEach((stop) => stop()); }
});

it("limits an eight-second scan to three window refreshes including its final reconciliation", async () => {
  for (let index = 0; index < 80; index++) {
    sync.enqueue({
      ...scope,
      sectionId: "1",
      kind: "item",
      effect: "membership",
      id: String(index),
    });
    await vi.advanceTimersByTimeAsync(100);
  }
  await vi.advanceTimersByTimeAsync(5000);
  expect(refresh).toHaveBeenCalledTimes(3);
  expect(invalidateRandomCatalogs).toHaveBeenCalledTimes(3);
});

it("does not lose a notification received while a canonical read is pending", async () => {
  let finish!: (value: { item: null; sectionId: string }) => void;
  vi.mocked(synchronizeLibraryItem).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  sync.enqueue({ ...scope, sectionId: "1", kind: "item", effect: "unknown", id: "1" });
  await vi.advanceTimersByTimeAsync(1000);
  sync.enqueue({ ...scope, sectionId: "1", kind: "item", effect: "unknown", id: "1" });
  finish({ item: null, sectionId: "1" });
  await vi.advanceTimersByTimeAsync(6000);
  expect(synchronizeLibraryItem).toHaveBeenCalledTimes(2);
  expect(refresh).toHaveBeenCalledTimes(2);
});

it("coalesces duplicate IDs and makes no hidden-tab requests before returning", async () => {
  focusManager.setFocused(false);
  for (let index = 0; index < 20; index++)
    sync.enqueue({ ...scope, sectionId: "1", kind: "item", effect: "unknown", id: "1" });
  await vi.advanceTimersByTimeAsync(20_000);
  expect(synchronizeLibraryItem).not.toHaveBeenCalled();
  focusManager.setFocused(true);
  await vi.advanceTimersByTimeAsync(1000);
  expect(synchronizeLibraryItem).toHaveBeenCalledTimes(1);
  expect(refresh).toHaveBeenCalledTimes(1);
});

it("ignores a different profile and discards unfinished work after disposal", async () => {
  sync.enqueue({ ...scope, profileKey: "other", kind: "recovery" });
  sync.enqueue({ ...scope, kind: "recovery" });
  sync.dispose();
  await vi.advanceTimersByTimeAsync(6000);
  expect(invalidateRandomCatalogs).not.toHaveBeenCalled();
  expect(refresh).not.toHaveBeenCalled();
});

it("updates cached full metadata with the same canonical read and rejects its older pending response", async () => {
  const key = mediaMetadataQueryKey(scope, "1");
  const fresh = {
    ratingKey: "1",
    title: "Confirmed",
    summary: "Canonical details",
    librarySectionID: 1,
  };
  client.setQueryData(key, { ...fresh, title: "Old" });
  let finish!: (value: typeof fresh) => void;
  const read = vi.fn(
    () =>
      new Promise<typeof fresh>((resolve) => {
        finish = resolve;
      }),
  );
  const stop = new QueryObserver(client, { queryKey: key, queryFn: read, staleTime: 0 }).subscribe(
    () => {},
  );
  vi.mocked(synchronizeLibraryItem).mockResolvedValue({
    item: null,
    sectionId: "1",
    metadata: fresh,
  });
  try {
    sync.enqueue({ ...scope, sectionId: "1", kind: "item", effect: "unknown", id: "1" });
    await vi.advanceTimersByTimeAsync(1000);
    expect(synchronizeLibraryItem).toHaveBeenCalledWith("1", expect.any(AbortSignal), true);
    expect(client.getQueryData(key)).toEqual(fresh);
    finish({ ...fresh, title: "Stale response" });
    await vi.advanceTimersByTimeAsync(10);
    expect(client.getQueryData(key)).toEqual(fresh);
    expect(read).toHaveBeenCalledTimes(1);
  } finally {
    stop();
  }
});

it("reuses one canonical read for the library, repeated playlist entries, details and availability", async () => {
  const card: LibraryCardDto = {
    ratingKey: "1",
    guid: "plex://movie/one",
    type: "movie",
    title: "Movie",
    librarySectionID: 1,
  };
  const metadata = { ...card, summary: "Old" } as Plex.Metadata;
  const library = libraryPageOptions(
    "server",
    { profileKey: "owner", sectionId: 1, sort: "titleSort" },
    0,
    0,
  ).queryKey;
  client.setQueryData(library, {
    offset: 0,
    size: 64,
    totalSize: 1,
    hasMore: false,
    items: [card],
  });
  const playlist = { kind: "playlist" as const, id: "20" };
  const stop = new QueryObserver(client, {
    queryKey: mediaListWindowKey(scope, playlist),
    queryFn: refresh,
    initialData: { revision: 0 },
    staleTime: Infinity,
  }).subscribe(() => {});
  const entries = ["101", "102"].map((playlistItemID, position) => ({
    kind: "media" as const,
    item: metadata,
    position,
    playlistItemID,
    supported: true,
  }));
  const list = listPageOptions(scope, playlist, 0, 0).queryKey;
  client.setQueryData(list, {
    offset: 0,
    total: 2,
    items: entries,
    summary: { kind: "playlist", id: "20", smart: false, title: "Weekend", summary: "", count: 2 },
  });
  const availability = availabilityQueryOptions(scope, [card.guid]).queryKey;
  client.setQueryData(availability, [metadata]);
  const details = mediaMetadataQueryKey(scope, "1");
  client.setQueryData(details, metadata);
  const updated = { ...metadata, summary: "Canonical", userRating: 8 };
  vi.mocked(synchronizeLibraryItem).mockResolvedValue({
    item: { ...card, userRating: 8 },
    metadata: updated,
    sectionId: "1",
  });
  try {
    sync.enqueue({ ...scope, kind: "item", effect: "unknown", sectionId: "1", id: "1" });
    await vi.advanceTimersByTimeAsync(1000);
    expect(synchronizeLibraryItem).toHaveBeenCalledTimes(1);
    expect(synchronizeLibraryItem).toHaveBeenCalledWith("1", expect.any(AbortSignal), true);
    expect(client.getQueryData(library)).toMatchObject({ items: [{ userRating: 8 }] });
    expect(client.getQueryData(list)).toMatchObject({
      items: entries.map((entry) => ({
        position: entry.position,
        playlistItemID: entry.playlistItemID,
        item: { summary: "Canonical", userRating: 8 },
      })),
    });
    expect(client.getQueryData(availability)).toEqual([updated]);
    expect(client.getQueryData(details)).toEqual(updated);
    expect(refresh).not.toHaveBeenCalled();
    expect(invalidateRandomCatalogs).not.toHaveBeenCalled();
  } finally {
    stop();
  }
});

it("keeps distinct playlist notifications in one batch without refreshing library pages or random catalogs", async () => {
  const reads = [vi.fn(async () => ({ revision: 1 })), vi.fn(async () => ({ revision: 1 }))];
  const stops = reads.map((read, index) =>
    new QueryObserver(client, {
      queryKey: mediaListWindowKey(scope, { kind: "playlist", id: String(20 + index) }),
      queryFn: read,
      initialData: { revision: 0 },
      staleTime: Infinity,
    }).subscribe(() => {}),
  );
  try {
    for (const id of ["20", "21"])
      sync.enqueue({ ...scope, kind: "list", listKind: "playlist", id });
    await vi.advanceTimersByTimeAsync(1000);
    reads.forEach((read) => expect(read).toHaveBeenCalledTimes(1));
    expect(refresh).not.toHaveBeenCalled();
    expect(invalidateRandomCatalogs).not.toHaveBeenCalled();
    expect(synchronizeLibraryItem).not.toHaveBeenCalled();
  } finally {
    stops.forEach((stop) => stop());
  }
});

it("retains a failed recovery for its trailing reconciliation", async () => {
  refresh.mockRejectedValueOnce(new Error("offline"));
  sync.enqueue({ ...scope, kind: "recovery" });
  await vi.advanceTimersByTimeAsync(1000);
  expect(refresh).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(5000);
  expect(refresh).toHaveBeenCalledTimes(2);
});

it("bounds pending scan evidence and never weakens an observed membership change", async () => {
  sync.enqueue({ ...scope, kind: "item", id: "1", effect: "membership", sectionId: "1" });
  sync.enqueue({ ...scope, kind: "item", id: "1", effect: "unknown", sectionId: "1" });
  await vi.advanceTimersByTimeAsync(1000);
  expect(synchronizeLibraryItem).not.toHaveBeenCalled();
  for (let index = 0; index < 257; index++)
    sync.enqueue({ ...scope, kind: "item", id: String(index), effect: "unknown" });
  await vi.advanceTimersByTimeAsync(5000);
  expect(synchronizeLibraryItem).not.toHaveBeenCalled();
  expect(refresh).toHaveBeenCalledTimes(2);
});

it("requests full canonical metadata for a cached episode and patches the season without another read", async () => {
  const episode = {
    ratingKey: "episode",
    guid: "plex://episode/one",
    title: "Episode",
    type: "episode" as const,
    index: 1,
    parentRatingKey: "season",
    librarySectionID: 1,
  };
  const options = mediaChildrenQueryOptions(scope, "season");
  client.setQueryData(options.queryKey, [episode] as Plex.Metadata[]);
  const read = vi.fn(async () => [episode] as Plex.Metadata[]);
  const leave = new QueryObserver(client, {
    ...options,
    queryFn: read,
    staleTime: Infinity,
  }).subscribe(() => {});
  const updated = { ...episode, viewCount: 1 };
  vi.mocked(synchronizeLibraryItem).mockResolvedValue({
    sectionId: "1",
    parentIds: ["season", "show"],
    item: updated,
    metadata: updated,
  });
  sync.enqueue({ ...scope, kind: "item", effect: "unknown", id: "episode", sectionId: "1" });
  await vi.advanceTimersByTimeAsync(1000);
  expect(synchronizeLibraryItem).toHaveBeenCalledWith("episode", expect.any(AbortSignal), true);
  expect(client.getQueryData<Plex.Metadata[]>(options.queryKey)?.[0].viewCount).toBe(1);
  expect(read).not.toHaveBeenCalled();
  leave();
});
