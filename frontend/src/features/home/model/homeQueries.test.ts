import { QueryObserver } from "@tanstack/react-query";
import { createQueryClient } from "shared/api/queryClient";
import { homeHeroOptions, homeWindowOptions, applyHomeChanges } from "./homeQueries";
import { libraryDirectoryQueryOptions, applyLibraryDirectoryChanges } from "features/library/model";
const scope = { serverId: "server", profileKey: "owner" };
const client = createQueryClient();
const closes: (() => void)[] = [];
afterEach(() => {
  closes.splice(0).forEach((close) => close());
  client.clear();
});

it("refreshes a changed section's discovery data and preserves unrelated sections and profiles", async () => {
  const affected = homeWindowOptions(scope, "1");
  const other = homeWindowOptions(scope, "2");
  const guest = homeWindowOptions({ ...scope, profileKey: "guest" }, "1");
  const read = vi.fn(async () => ({ size: 1 }) as Plex.MediaContainer);
  closes.push(
    new QueryObserver(client, {
      ...affected,
      queryFn: read,
      initialData: { size: 0 } as Plex.MediaContainer,
      staleTime: Infinity,
    }).subscribe(() => {}),
  );
  client.setQueryData(other.queryKey, { size: 0 } as Plex.MediaContainer);
  client.setQueryData(guest.queryKey, { size: 0 } as Plex.MediaContainer);
  await applyLibraryDirectoryChanges(client, [
    {
      change: { ...scope, kind: "item", effect: "membership", sectionId: "1" },
    },
  ]);
  expect(read).toHaveBeenCalledTimes(1);
  expect(client.getQueryState(other.queryKey)?.isInvalidated).toBe(false);
  expect(client.getQueryState(guest.queryKey)?.isInvalidated).toBe(false);
});

it("retains the selected hero during canonical watched-state changes", async () => {
  const key = homeHeroOptions(client, scope, ["1"]);
  const read = vi.fn(async (): Promise<string | null> => "another");
  client.setQueryData(key.queryKey, "movie");
  closes.push(new QueryObserver(client, { ...key, queryFn: read }).subscribe(() => {}));
  const item = {
    ratingKey: "movie",
    guid: "plex://movie/one",
    title: "Movie",
    type: "movie" as const,
    art: "/art",
    librarySectionID: 1,
  };
  await applyHomeChanges(client, [
    {
      change: {
        ...scope,
        kind: "item",
        effect: "unknown",
        id: "movie",
        sectionId: "1",
      },
      update: { item, sectionId: "1" },
    },
  ]);
  expect(read).not.toHaveBeenCalled();
  expect(client.getQueryData(key.queryKey)).toBe("movie");
});

it("selects another hero when the confirmed metadata loses its artwork", async () => {
  const options = homeHeroOptions(client, scope, ["1"]);
  const read = vi.fn(async (): Promise<string | null> => "another");
  client.setQueryData(options.queryKey, "movie");
  closes.push(new QueryObserver(client, { ...options, queryFn: read }).subscribe(() => {}));
  const item = {
    ratingKey: "movie",
    guid: "plex://movie/one",
    title: "Movie",
    type: "movie" as const,
    librarySectionID: 1,
  };
  await applyHomeChanges(client, [
    {
      change: {
        ...scope,
        kind: "item",
        effect: "metadata",
        fields: ["art"],
        id: "movie",
        sectionId: "1",
      },
      update: { item, sectionId: "1" },
    },
  ]);
  expect(read).toHaveBeenCalledTimes(1);
  expect(client.getQueryData(options.queryKey)).toBe("another");
});

it("cancels a cold directory read before applying a server change", async () => {
  let finish!: (data: Plex.MediaContainer) => void;
  let signal!: AbortSignal;
  const read = vi
    .fn()
    .mockImplementationOnce(({ signal: value }) => {
      signal = value;
      return new Promise<Plex.MediaContainer>((resolve) => {
        finish = resolve;
      });
    })
    .mockResolvedValue({ size: 0, Metadata: [] });
  const options = libraryDirectoryQueryOptions(scope, "/library/onDeck");
  closes.push(new QueryObserver(client, { ...options, queryFn: read }).subscribe(() => {}));
  await applyLibraryDirectoryChanges(client, [
    {
      change: {
        ...scope,
        kind: "item",
        effect: "unknown",
        id: "movie",
        sectionId: "1",
      },
    },
  ]);
  expect(signal.aborted).toBe(true);
  finish({
    size: 1,
    Metadata: [{ ratingKey: "stale" }],
  } as Plex.MediaContainer);
  await Promise.resolve();
  expect(read).toHaveBeenCalledTimes(2);
  expect(client.getQueryData(options.queryKey)).toEqual({
    size: 0,
    Metadata: [],
  });
});

it("does not invalidate unrelated genre directories or a different profile", async () => {
  const changed = libraryDirectoryQueryOptions(scope, "/library/sections/1/genre/Drama");
  const other = libraryDirectoryQueryOptions(scope, "/library/sections/2/genre/Drama");
  const guest = libraryDirectoryQueryOptions(
    { ...scope, profileKey: "guest" },
    "/library/sections/1/genre/Drama",
  );
  for (const options of [changed, other, guest])
    client.setQueryData(options.queryKey, {
      size: 0,
      Metadata: [],
      librarySectionID: 1,
      mediaTagPrefix: "",
      mediaTagVersion: 0,
      viewGroup: "movie",
    });
  await applyLibraryDirectoryChanges(client, [
    {
      change: { ...scope, kind: "item", effect: "membership", sectionId: "1" },
    },
  ]);
  expect(client.getQueryState(changed.queryKey)?.isInvalidated).toBe(true);
  expect(client.getQueryState(other.queryKey)?.isInvalidated).toBe(false);
  expect(client.getQueryState(guest.queryKey)?.isInvalidated).toBe(false);
});
