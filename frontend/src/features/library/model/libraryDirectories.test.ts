import { QueryObserver } from "@tanstack/react-query";
import { createQueryClient } from "shared/api/queryClient";
import type {
  MediaMetadata,
  ReconciledMediaChange,
} from "entities/media/model";
import {
  applyLibraryDirectoryChanges,
  libraryDirectoryQueryOptions,
} from "./libraryDirectories";

const scope = { serverId: "server", profileKey: "owner" };
const client = createQueryClient();
const closes: (() => void)[] = [];
const movie = { ratingKey: "1", type: "movie", title: "Movie", summary: "Old", librarySectionID: 1 } as MediaMetadata;
const container = { Metadata: [movie], size: 1, totalSize: 50, offset: 16, viewGroup: "movie", Directory: [{ key: "all", title: "All" }] } as Plex.MediaContainer;
function observe(dir: string, props?: Record<string, unknown>, initialData = container) {
  const options = libraryDirectoryQueryOptions(scope, dir, props);
  const read = vi.fn(async () => initialData);
  closes.push(new QueryObserver(client, { ...options, queryFn: read, initialData, staleTime: Infinity }).subscribe(() => {}));
  return { read, key: options.queryKey };
}
function edit(fields: string[], metadata: MediaMetadata = { ...movie, summary: "New" }): ReconciledMediaChange {
  return {
    change: { ...scope, sectionId: "1", kind: "item", effect: "metadata", id: metadata.ratingKey, fields },
    update: { item: metadata as unknown as NonNullable<ReconciledMediaChange["update"]>["item"], metadata, sectionId: "1" },
  };
}
afterEach(() => {
  closes.splice(0).forEach((close) => close());
  client.clear();
});

it("ignores schema/facets and patches stable raw pages without losing container fields", async () => {
  const directories = ["/library/sections/1", "/library/sections/1/genre", "/library/sections/1/actor"]
    .map((dir) => observe(dir, undefined, { ...container, Metadata: [] }));
  const page = observe("/library/sections/1/all", { sort: "titleSort:asc", "X-Plex-Container-Start": 16 });
  await applyLibraryDirectoryChanges(client, [edit(["summary"])]);
  expect([...directories, page].map(({ read }) => read.mock.calls.length)).toEqual([0, 0, 0, 0]);
  expect(client.getQueryData(page.key)).toEqual({ ...container, Metadata: [{ ...movie, summary: "New" }] });
});

it("refreshes watched-dependent history and On Deck while preserving unrelated facets and sorting", async () => {
  const history = observe("/library/sections/1/all", { sort: "lastViewedAt:desc", "unwatched!": 1 });
  const onDeck = observe("/library/onDeck");
  const stable = observe("/library/sections/1/all", { sort: "titleSort:asc" });
  const facets = ["genre", "actor"].map((field) => observe(`/library/sections/1/${field}`, undefined, { ...container, Metadata: [] }));
  await applyLibraryDirectoryChanges(client, [edit(["viewCount", "lastViewedAt"], { ...movie, viewCount: 1, lastViewedAt: 123 })]);
  expect([history, onDeck, stable, ...facets].map(({ read }) => read.mock.calls.length)).toEqual([1, 1, 0, 0, 0]);
  expect(client.getQueryData<Plex.MediaContainer>(stable.key)?.Metadata?.[0].viewCount).toBe(1);
});

it("revalidates affected tags and filtered results even when the changed item was not cached", async () => {
  const genre = observe("/library/sections/1/genre", undefined, { ...container, Metadata: [] });
  const actor = observe("/library/sections/1/actor", undefined, { ...container, Metadata: [] });
  const filtered = observe("/library/sections/1/genre/393", undefined, { ...container, Metadata: [] });
  const all = observe("/library/sections/1/all", undefined, { ...container, Metadata: [] });
  await applyLibraryDirectoryChanges(client, [edit(["Genre"], { ...movie, ratingKey: "unseen", Genre: [{ id: 393, tag: "Action", filter: "genre=393" }] })]);
  expect([genre, actor, filtered, all].map(({ read }) => read.mock.calls.length)).toEqual([1, 0, 1, 0]);
});

it("keeps unknown predicates and sorts conservative despite equal cached metadata", async () => {
  const unknownFilter = observe("/library/sections/1/all", { futurePredicate: 1 });
  const unknownSort = observe("/library/sections/1/all", { sort: "futureSort:asc" });
  const opaque = observe("/library/sections/1/hub/custom");
  await applyLibraryDirectoryChanges(client, [edit([], movie)]);
  expect([unknownFilter, unknownSort, opaque].map(({ read }) => read.mock.calls.length)).toEqual([1, 1, 1]);
});

it("refreshes cached prior parents in raw show pages", async () => {
  const show = observe("/library/sections/1/all", { type: 2 }, {
    ...container, viewGroup: "show", Metadata: [{ ratingKey: "old-show", type: "show" } as MediaMetadata],
  });
  await applyLibraryDirectoryChanges(client, [{
    ...edit(["viewCount"], { ...movie, type: "episode", parentRatingKey: "new-season", grandparentRatingKey: "new-show" }),
    parentIds: ["old-season", "old-show", "new-season", "new-show"],
  }]);
  expect(show.read).toHaveBeenCalledTimes(1);
});

it("cancels an old read before patching could be overwritten and refetches once per batch", async () => {
  const options = libraryDirectoryQueryOptions(scope, "/library/sections/1/all");
  let finish!: (value: Plex.MediaContainer) => void;
  let signal!: AbortSignal;
  const read = vi.fn().mockImplementationOnce((context) => {
    signal = context.signal;
    return new Promise<Plex.MediaContainer>((resolve) => { finish = resolve; });
  }).mockResolvedValue({ ...container, Metadata: [{ ...movie, summary: "New" }] });
  client.setQueryData(options.queryKey, container);
  closes.push(new QueryObserver(client, { ...options, queryFn: read, staleTime: 0 }).subscribe(() => {}));
  await applyLibraryDirectoryChanges(client, [edit(["summary"]), edit(["summary"])]);
  expect(signal.aborted).toBe(true);
  finish(container);
  await Promise.resolve();
  expect(read).toHaveBeenCalledTimes(2);
  expect(client.getQueryData<Plex.MediaContainer>(options.queryKey)?.Metadata?.[0].summary).toBe("New");
});

it("does not let a cold stable directory publish metadata read before a confirmed change", async () => {
  const options = libraryDirectoryQueryOptions(scope, "/library/sections/1/all");
  let signal!: AbortSignal;
  const read = vi.fn().mockImplementationOnce((context) => {
    signal = context.signal;
    return new Promise(() => {});
  }).mockResolvedValue({ ...container, Metadata: [{ ...movie, summary: "New" }] });
  closes.push(new QueryObserver(client, { ...options, queryFn: read }).subscribe(() => {}));
  await applyLibraryDirectoryChanges(client, [edit(["summary"])]);
  expect(signal.aborted).toBe(true);
  expect(read).toHaveBeenCalledTimes(2);
  expect(client.getQueryData<Plex.MediaContainer>(options.queryKey)?.Metadata?.[0].summary).toBe("New");
});
